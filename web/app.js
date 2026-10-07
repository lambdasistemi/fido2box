// fido2box: manage locked boxes (the library in this browser and a GitHub repository). Everything runs in the page.
import { keysOf, newDataKey, emptyVault, listItems, encryptItem, TOKEN_TITLE } from './crypto.js';
import { safeUrl } from './url.js';
import { RP, unlockVault, enrolKey, detectKey, probeKey, writeLabel, readLabel } from './webauthn.js';
import { NAME_RE, listRemote, fetchRemote, saveToGitHub } from './github.js';
import { lib } from './store.js';
import { helpButton, inlineHelpEnabled, setInlineHelp, closeHelp, documentationView } from './guidance.js';
const $app = document.getElementById('app'), $status = document.getElementById('status');
const h = (tag, props, ...kids) => {
  const e = document.createElement(tag);
  // password managers must leave this page alone: our inputs are not logins (1Password, LastPass, Bitwarden)
  if (tag === 'input') { e.setAttribute('data-1p-ignore', ''); e.setAttribute('data-lpignore', 'true'); e.setAttribute('data-bwignore', 'true'); e.setAttribute('autocomplete', 'off'); }
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'on') for (const [ev, f] of Object.entries(v)) e.addEventListener(ev, f);
    else if (k === 'class') e.className = v; else if (k === 'value') e.value = v;
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
};
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const S = { who: '', probe: null, boxes: [], remote: null, remoteErr: '', unlocked: {}, tab: 'items', repo: '', token: '', detected: '', confirm: '', newOpen: false, busy: false };
const storedRepo = () => { try { return localStorage.getItem('box-repo') || ''; } catch (e) { return ''; } };
S.repo = new URLSearchParams(location.search).get('repo') || storedRepo() || ((window.BOX_DEFAULTS || {}).repo || '');
const L = { e_cancel: 'Cancelled or timed out. Touch the key when it answers.', e_nokey: 'This browser or key cannot do this (use Chrome or Edge with the key plugged in).', e_uv: 'The key did not verify you (PIN). Try again.', e_other: 'Something went wrong: ' };

let statusTimer = null;
function say(msg, bad) { $status.textContent = msg; $status.className = bad ? 'bad' : ''; $status.style.display = 'block'; clearTimeout(statusTimer); statusTimer = setTimeout(() => { $status.style.display = 'none'; }, bad ? 7000 : 3500); }
const ghError = (e) => ({
  RemoteNewer: () => 'GitHub already has a newer version (rev ' + e.rev + '). Pull it first.',
  BadToken: () => 'GitHub refused the token. It may have expired: make a new one.',
  NoRepo: () => 'The token cannot see that repository, or it does not exist.',
  Conflict: () => 'The file changed on GitHub meanwhile. Refresh and try again.',
  TypeError: () => 'Could not reach GitHub.' }[e.name] || (() => 'GitHub error: ' + (e.message || e.name)))();
const errText = (e) => (['RemoteNewer', 'BadToken', 'NoRepo', 'Conflict', 'GitHubError', 'TypeError'].includes(e.name) ? ghError(e) : (e.name === 'NoUV' ? L.e_uv : niceError(e, L)));
// A handler runs once at a time (its own flag): a key waiting for a touch must not freeze the other buttons.
// On an error show it and keep the form as it is (no re-render, so nothing typed is lost).
const act = (f, opts) => { let running = false; return async (ev) => {
  if (running) { say('Still waiting: touch the key, or wait for it to time out (one minute).', true); return; }
  running = true; let failed = false;
  try { await f(ev); } catch (e) { failed = true; say(errText(e), true); } finally { running = false; if (!failed && !(opts && opts.keep)) render(); } }; };
let keyBusy = false;
async function withKey(f) {
  if (keyBusy) throw new Error('Still waiting for the key: touch it, or wait for it to time out (one minute).');
  keyBusy = true; say('Waiting for your key: enter its PIN if asked, then touch it.');
  try { return await f(); } finally { keyBusy = false; }
}
/** @param {string[]} ids */
const detect = (ids) => withKey(() => detectKey(ids));
// the words shown for the errors a browser or a key can raise
function niceError(e, L) {
  const n = e && e.name;
  if (n === 'NotAllowedError' || n === 'AbortError') return L.e_cancel;
  if (n === 'NoPrf' || n === 'NotSupportedError' || n === 'SecurityError') return L.e_nokey;
  return L.e_other + ((e && (e.message || n)) || '');
}

// ---------- data ----------
async function reload() { S.boxes = await lib.list(); }
const local = (name) => S.boxes.find((b) => b.name === name);
const hostOf = (u) => { const s = safeUrl(u); return s ? new URL(s).host : 'no address'; };
const shortId = (id) => id.replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
const currentToken = () => S.token || (Object.values(S.unlocked).map((u) => u.plain.find((i) => i.title === TOKEN_TITLE)).find(Boolean) || {}).secret || '';
function sync(localBox, remoteBox) {
  if (localBox && !remoteBox) return S.remote ? { t: 'only here', c: 'warn' } : { t: '', c: '' };
  if (!localBox && remoteBox) return { t: 'only on GitHub', c: 'warn' };
  if (JSON.stringify(localBox) === JSON.stringify(remoteBox)) return { t: 'in sync', c: 'ok' };
  const a = localBox.rev || 0, b = remoteBox.rev || 0;
  return a > b ? { t: 'ahead of GitHub', c: 'warn' } : a < b ? { t: 'behind GitHub', c: 'warn' } : { t: 'differs from GitHub', c: 'bad' };
}
async function refreshRemote() {
  S.remote = null; S.remoteErr = '';
  const tok = currentToken();
  if (!REPO_RE.test(S.repo)) { S.remoteErr = 'Set the repository in Settings.'; return; }
  if (!tok) { S.remoteErr = 'Not connected: unlock a box that holds a GitHub token, or paste one in Settings.'; return; }
  try { const names = await listRemote(S.repo, tok); const boxes = {}; await Promise.all(names.map(async (n) => { boxes[n] = await fetchRemote(S.repo, tok, n); })); S.remote = boxes; }
  catch (e) { S.remoteErr = ghError(e); }
}
async function unlock(name) { const rec = local(name); const data = await withKey(() => unlockVault(rec.box)); S.unlocked[name] = { data, plain: await listItems(rec.box, data) }; if (!S.remote && currentToken()) await refreshRemote(); }
async function commit(name, keys) {                                // save a change to the library: rev goes up by one
  const rec = local(name), U = S.unlocked[name];
  const box = { v: 2, rev: (rec.box.rev || 0) + 1, rpId: rec.box.rpId || RP, keys: keys || keysOf(rec.box), items: U ? await Promise.all(U.plain.map((it) => encryptItem(U.data, it))) : (rec.box.items || []) };
  await lib.put(name, box); await reload();
}
function download(text, file) { const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: file }); a.click(); }
const confirmBtn = (key, label, doIt, cls) => S.confirm === key
  ? h('span', null, h('button', { class: 'danger', on: { click: act(async () => { S.confirm = ''; await doIt(); }) } }, 'Yes, ' + label.toLowerCase()), ' ', h('button', { on: { click: () => { S.confirm = ''; render(); } } }, 'Keep'))
  : h('button', { class: cls || '', on: { click: () => { S.confirm = key; render(); } } }, label);
const chip = (t, c) => (t ? h('span', { class: 'chip ' + (c || '') }, t) : null);
const ghUrl = (p) => (REPO_RE.test(S.repo) ? 'https://github.com/' + S.repo + '/' + p : '');
const ghLink = (text, p, cls) => (ghUrl(p) ? h('a', { class: cls || '', href: ghUrl(p), target: '_blank', rel: 'noopener noreferrer', on: { click: (e) => e.stopPropagation() } }, text) : null);

// ---------- naming the key you are about to add ----------
// The keys this browser already knows about: those listed in any box, by credential.
function knownKeys() {
  const map = new Map();
  for (const r of S.boxes) for (const k of keysOf(r.box)) { const e = map.get(k.id) || { id: k.id, names: new Set(), boxes: [] }; e.names.add(k.name); e.boxes.push(r.name); map.set(k.id, e); }
  return [...map.values()];
}
// A name field with help: a key used before is recognised by a touch and its name filled in; a new key is named by you.
function keyPicker(id, inThisBox) {
  const known = knownKeys(), first = (e) => [...e.names][0]; let already = false;
  const input = h('input', { id, placeholder: known.length ? 'a name for this key, or press "Which key is this?"' : 'a name for this key, e.g. hk-home', autocomplete: 'off' });
  const hint = h('p', { class: 'muted small', id: id + 'Hint' });
  const chips = known.filter((e) => !inThisBox.includes(e.id)).map((e) => h('button', { class: 'chip', type: 'button', on: { click: () => { input.value = first(e); } } }, first(e)));
  const find = known.length ? h('button', { id: id + 'Find', type: 'button', on: { click: act(async () => {
    let hit = null;
    try { const got = await detect(known.map((x) => x.id)); hit = known.find((e) => e.id === got) || null; } catch (e) { if (e.original !== 'NotAllowedError') throw e; }
    already = !!hit && inThisBox.includes(hit.id);
    if (!hit) { input.value = ''; hint.textContent = 'This is not a key you have used before. Give it a new name.'; }
    else if (already) hint.textContent = '"' + first(hit) + '" is already in this box. Plug in a different key.';
    else { input.value = first(hit); hint.textContent = 'This is "' + first(hit) + '" (it opens ' + hit.boxes.join(', ') + ').'; }
  }, { keep: true }) } }, 'Which key is this? (PIN, touch)') : null;
  const read = h('button', { id: id + 'Label', type: 'button', on: { click: act(async () => { const v = await withKey(readLabelOrNone); if (v) { input.value = v; hint.textContent = 'The key says it is "' + v + '".'; } else hint.textContent = 'No label found on this key (or the request was cancelled).'; }, { keep: true }) } }, 'Read its label (PIN, touch)');
  return { node: h('div', null, input, chips.length ? h('p', { class: 'small muted' }, 'Keys you have used: ', chips) : null, find, read, hint), name: () => input.value.trim(), alreadyIn: () => already };
}
// ---------- Boxes ----------
function boxesView() {
  const names = [...new Set([...S.boxes.map((b) => b.name), ...Object.keys(S.remote || {})])].sort();
  const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, id: 'importFile', on: { change: act(async (ev) => {
    const f = ev.target.files[0]; if (!f) return; const box = JSON.parse(await f.text());
    if (!(box && (box.v === 1 || box.v === 2) && Array.isArray(keysOf(box)))) throw new Error('That file is not a box.');
    const name = f.name.replace(/\.json$/i, '').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 40) || 'box';
    if (local(name)) throw new Error('A box named "' + name + '" is already in this browser. Delete it first, or rename the file.');
    await lib.put(name, box); await reload(); say('Imported "' + name + '".'); ev.target.value = ''; }) } });
  const nameIn = h('input', { id: 'newName', placeholder: 'box name, e.g. paolo', maxlength: 40 }), kp = keyPicker('newKey', []);
  const form = S.newOpen ? h('div', { class: 'card' }, h('h2', null, 'New box ', helpButton('create')),
    h('label', { for: 'newName' }, 'Name (letters, digits, - and _)'), nameIn, h('label', { for: 'newKey' }, 'Security key name'), kp.node,
    h('p', { class: 'muted small' }, 'Plug in the hardware security key you will open this box with, and only that one. It asks for its PIN and a touch, twice.'),
    h('div', { class: 'row' }, h('button', { class: 'primary', id: 'createBox', on: { click: act(async () => {
      const name = nameIn.value.trim(), kn = kp.name();
      if (!NAME_RE.test(name)) throw new Error('The name may use letters, digits, - and _ (up to 40).'); if (local(name)) throw new Error('A box with that name already exists here.'); if (!kn) throw new Error('Give the security key a name, for example hk-home.');
      const data = newDataKey(); const box = { ...(await withKey(() => enrolKey(emptyVault(RP), kn, data))), rev: 1 };
      await lib.put(name, box); await reload(); S.unlocked[name] = { data, plain: [] }; S.newOpen = false; location.hash = '#/box/' + name; say('Created "' + name + '".'); }) } }, 'Create'),
      h('button', { on: { click: () => { S.newOpen = false; render(); } } }, 'Cancel'))) : null;
  const rows = names.map((n) => { const l = local(n), r = S.remote && S.remote[n], st = sync(l && l.box, r), b = (l && l.box) || r;
    return h('tr', { class: 'click', on: { click: () => { location.hash = '#/box/' + encodeURIComponent(n); } } },
      h('td', null, h('a', { class: 'box-link', href: '#/box/' + encodeURIComponent(n) }, n), ' ', S.unlocked[n] ? chip('unlocked', 'live') : null),
      h('td', null, l ? chip('this browser') : null, r ? ghLink('GitHub ↗', 'blob/main/boxes/' + n + '.json', 'chip') : null),
      h('td', null, h('span', { class: 'mobile-label' }, 'Keys: '), String(keysOf(b).length)), h('td', null, 'rev ' + (b.rev || 0)), h('td', null, chip(st.t, st.c))); });
  return h('div', null,
    h('div', { class: 'row sp' }, h('h1', null, 'Boxes ', helpButton('boxes')), h('div', { class: 'row' },
      h('button', { class: 'primary', id: 'newBtn', on: { click: () => { S.newOpen = true; render(); } } }, 'New box'),
      h('button', { id: 'importBtn', on: { click: () => document.getElementById('importFile').click() } }, 'Import file'), helpButton('recovery'),
      h('button', { id: 'refreshBtn', on: { click: act(async () => { await refreshRemote(); if (S.remote) say('GitHub: ' + Object.keys(S.remote).length + ' box(es).'); else say(S.remoteErr, true); }) } }, 'Refresh GitHub'))),
    h('p', { class: 'muted', id: 'intro' }, 'Your secrets, locked with your hardware keys. Each box holds your items; any of its enrolled keys can unlock it.'),
    file, form,
    h('p', { class: 'muted small', id: 'ghLine' }, S.remote ? ['GitHub: ', ghLink(S.repo, 'tree/main/boxes'), ', ' + Object.keys(S.remote).length + ' box(es).'] : [S.remoteErr || 'GitHub: not checked.', ...(ghUrl('tree/main/boxes') ? [' ', ghLink('Open the repository ↗', 'tree/main/boxes')] : [])]),
    names.length ? h('div', { class: 'card' }, h('table', null, h('tr', null, h('th', null, 'Name'), h('th', null, 'Where'), h('th', null, 'Security keys'), h('th', null, 'Version'), h('th', null, 'Status')), rows))
      : h('div', { class: 'card empty', id: 'emptyBoxes' }, h('p', null, 'No boxes yet.'), h('p', { class: 'small' }, 'Make a new one, or import a box file. If you are recovering, download your box file from ', REPO_RE.test(S.repo) ? h('a', { href: 'https://github.com/' + S.repo + '/tree/main/boxes', target: '_blank', rel: 'noopener noreferrer' }, S.repo) : 'your repository on GitHub', ' (log in with your key) and import it here.')));
}

// ---------- one box ----------
function boxView(name) {
  const rec = local(name), rem = S.remote && S.remote[name], U = S.unlocked[name];
  const head = h('div', null, h('p', { class: 'small' }, h('a', { href: '#/' }, '← Boxes')),
    h('div', { class: 'row sp' }, h('h1', null, name), h('div', { class: 'row' }, U ? chip('unlocked', 'live') : chip('locked'), U ? h('button', { id: 'lockBtn', on: { click: () => { delete S.unlocked[name]; render(); } } }, 'Lock') : null)));
  if (!rec && !rem) return h('div', null, head, h('div', { class: 'card empty' }, 'No such box.'));
  const tabs = h('div', { class: 'tabs' }, ['items', 'keys', 'sync'].map((t) => h('button', { class: S.tab === t ? 'on' : '', id: 'tab-' + t, on: { click: () => { S.tab = t; S.confirm = ''; render(); } } }, { items: 'Items', keys: 'Security keys', sync: 'Sync' }[t])), helpButton(S.tab));
  return h('div', null, head, tabs, S.tab === 'keys' ? keysTab(name, rec, U) : S.tab === 'sync' ? syncTab(name, rec, rem) : itemsTab(name, rec, rem, U));
}
function itemsTab(name, rec, rem, U) {
  if (!rec) return h('div', { class: 'card' }, h('p', null, 'This box is only on GitHub. Pull it into this browser to use it.'), h('button', { class: 'primary', on: { click: () => { S.tab = 'sync'; render(); } } }, 'Go to Sync'));
  if (!U) return h('div', { class: 'card empty' }, h('p', null, 'This box is locked.'), h('p', { class: 'small' }, 'Plug in one of its security keys (see the Security keys tab) and press Unlock. The key asks for its PIN and a touch.'),
    h('button', { class: 'primary', id: 'unlockBtn', on: { click: act(async () => { await unlock(name); }) } }, 'Unlock'));
  const usable = U.plain.map((it, i) => [it, i]).filter(([it]) => it.title !== TOKEN_TITLE);
  const t = { name: h('input', { id: 'iName', placeholder: 'e.g. 1Password' }), url: h('input', { id: 'iUrl', placeholder: 'https://my.1password.com/signin' }), secret: h('input', { id: 'iSecret', type: 'password', autocomplete: 'off' }) };
  return h('div', null,
    h('div', { class: 'card' }, usable.length ? h('table', null, usable.map(([it, i]) => h('tr', null,
      h('td', null, h('strong', null, it.title || '(no name)')), h('td', { class: 'muted' }, hostOf(it.url)),
      h('td', { class: 'r' },
        safeUrl(it.url) ? h('a', { class: 'btn', href: safeUrl(it.url), target: '_blank', rel: 'noopener noreferrer' }, 'Open') : null, ' ',
        h('button', { class: 'copy', on: { click: act(async (ev) => { await navigator.clipboard.writeText(it.secret); say('Copied. It is cleared after a minute.'); clearTimeout(S.clip); S.clip = setTimeout(async () => { try { if ((await navigator.clipboard.readText()) === it.secret) await navigator.clipboard.writeText(' '); } catch (e) { say('Could not clear the clipboard: clear it yourself.', true); } }, 60000); }) } }, 'Copy'), ' ',
        confirmBtn('i' + i, 'Delete', async () => { U.plain.splice(i, 1); await commit(name); }))))) : h('p', { class: 'muted' }, 'No items yet.')),
    h('div', { class: 'card' }, h('h2', null, 'Add an item'), h('label', { for: 'iName' }, 'Name'), t.name, h('label', { for: 'iUrl' }, 'Web address (where Open goes)'), t.url, h('label', { for: 'iSecret' }, 'Secret (what Copy copies)'), t.secret,
      h('p', null, h('button', { class: 'primary', id: 'addItem', on: { click: act(async () => {
        const title = t.name.value.trim(), url = t.url.value.trim(), secret = t.secret.value;
        if (!title) throw new Error('Give it a name.'); if (!safeUrl(url)) throw new Error('The web address must start with https://'); if (!secret) throw new Error('The secret is empty.');
        U.plain.push({ title, url, secret }); await commit(name); say('Added "' + title + '".'); }) } }, 'Add'))));
}
function keysTab(name, rec, U) {
  if (!rec) return h('div', { class: 'card' }, 'Pull this box first.');
  const ks = keysOf(rec.box), kp = keyPicker('kName', ks.map((k) => k.id));
  return h('div', null,
    h('div', { class: 'card' }, h('table', null, ks.map((k, i) => h('tr', null,
      h('td', null, h('strong', null, k.name), ' ', S.detected === k.id ? chip('inserted now', 'live') : null), h('td', { class: 'muted small' }, shortId(k.id)),
      h('td', { class: 'r' }, ks.length > 1 ? confirmBtn('k' + i, 'Remove', async () => { await commit(name, ks.filter((_, j) => j !== i)); }) : h('span', { class: 'muted small' }, 'the only security key'))))),
      h('p', { class: 'muted small' }, 'Removing a key does not revoke it: anyone who ever had it can still open older copies of this box. To revoke, make a new box.'),
      h('button', { id: 'detectBtn', on: { click: act(async () => { const id = await detect(ks.map((k) => k.id)); S.detected = id; const k = ks.find((x) => x.id === id); say(k ? '"' + k.name + '" is inserted.' : 'A key answered that is not in this box.'); }) } }, 'Detect the inserted key (PIN, touch)')),
    h('div', { class: 'card' }, h('h2', null, 'Add a security key'), U ? [h('label', { for: 'kName' }, 'Security key name'), kp.node, h('p', { class: 'muted small' }, 'Plug in the hardware key you want to add, and only that one. It asks for its PIN and a touch, twice. Enter the PIN carefully: wrong PINs use up the number of tries the key allows.'),
      h('button', { class: 'primary', id: 'addKey', on: { click: act(async () => { const v = kp.name(); if (kp.alreadyIn()) throw new Error('That key is already in this box.'); if (!v) throw new Error('Give the security key a name, for example hk-home.'); if (ks.some((k) => k.name === v)) throw new Error('A key with that name is already in this box.');
        const added = await withKey(() => enrolKey({ ...rec.box, keys: keysOf(rec.box) }, v, U.data)); await commit(name, added.keys); say('Added "' + v + '".'); }) } }, 'Add this security key')]
      : h('p', { class: 'muted' }, 'Unlock the box first (Items tab): adding a security key needs the box open.')));
}
// The three steps that make "Push to GitHub" work: a repository, a token kept inside the box, a connection test.
function connectCard(name) {
  const U = S.unlocked[name], hasTok = !!U && U.plain.some((i) => i.title === TOKEN_TITLE), repoOk = REPO_RE.test(S.repo), conn = !!S.remote;
  const step = (n, done, title, ...body) => h('div', { class: 'step' }, h('span', { class: 'num' + (done ? ' done' : '') }, done ? '✓' : String(n)), h('div', { class: 'grow' }, h('strong', null, title), ...body));
  const repoIn = h('input', { id: 'repoIn2', value: S.repo, placeholder: 'owner/name, e.g. paolino/fido-box' }), tokIn = h('input', { id: 'iToken', type: 'password', autocomplete: 'off', placeholder: 'github_pat_…' });
  const tokenHelp = [h('ol', { class: 'muted small' },
      h('li', null, 'Open GitHub\'s token page (the button below) and sign in. A token is a password for this app to write to GitHub; it is not a security key.'), h('li', null, 'Name it, for example fido-box, and pick the longest expiry.'),
      h('li', null, 'Repository access: "Only select repositories", then ', h('code', null, repoOk ? S.repo : 'your box repository'), '.'),
      h('li', null, 'Permissions → Repository permissions → Contents → Read and write. Nothing else.'), h('li', null, 'Generate the token, copy it, and paste it here.')),
    h('p', { class: 'row' }, h('a', { class: 'btn', id: 'openGh', href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener noreferrer' }, 'Open GitHub to create the token')), h('label', { for: 'iToken' }, 'GitHub token'), tokIn,
    h('p', null, h('button', { class: 'primary', id: 'addToken', on: { click: act(async () => { const v = tokIn.value.trim(); if (!v) throw new Error('Paste the token first.');
      U.plain = U.plain.filter((i) => i.title !== TOKEN_TITLE); U.plain.push({ title: TOKEN_TITLE, url: 'https://github.com/settings/personal-access-tokens', secret: v }); await commit(name); say('The token is kept in the box.'); }) } }, 'Keep it in this box'))];
  return h('div', { class: 'card', id: 'connect' }, h('h2', null, 'Connect to GitHub ', helpButton('tokens')),
    step(1, repoOk, 'The repository that holds your boxes',
      repoOk ? h('p', { class: 'muted small' }, S.repo, ' · ', h('a', { href: '#/settings' }, 'change'))
        : [h('label', { for: 'repoIn2' }, 'GitHub repository (owner/name)'), repoIn, h('p', null, h('button', { id: 'saveRepo2', on: { click: act(async () => { const v = repoIn.value.trim(); if (!REPO_RE.test(v)) throw new Error('Use owner/name.'); S.repo = v; try { localStorage.setItem('box-repo', v); } catch (e) {} S.remote = null; say('Repository set.'); }) } }, 'Save'))]),
    step(2, hasTok, 'A GitHub token, kept inside this box',
      hasTok ? [h('p', { class: 'muted small' }, 'A token is kept in this box. It is used only to talk to GitHub, and it is never shown.'), confirmBtn('tok', 'Remove the token', async () => { U.plain = U.plain.filter((i) => i.title !== TOKEN_TITLE); await commit(name); })]
        : U ? tokenHelp : [h('p', { class: 'muted small' }, 'The token is stored inside the box, so unlock the box first.'), h('button', { id: 'goItems', on: { click: () => { S.tab = 'items'; render(); } } }, 'Go to Items to unlock')]),
    step(3, conn, 'Check the connection', h('p', { class: 'muted small', id: 'connState' }, conn ? 'Connected: ' + Object.keys(S.remote).length + ' box(es) on GitHub.' : (S.remoteErr || 'Not checked yet.')),
      h('button', { id: 'testGh', disabled: !repoOk || !currentToken(), on: { click: act(async () => { await refreshRemote(); say(S.remote ? 'Connected: ' + Object.keys(S.remote).length + ' box(es) on GitHub.' : S.remoteErr, !S.remote); }) } }, 'Test the connection')));
}
function syncTab(name, rec, rem) {
  const st = sync(rec && rec.box, rem), tok = currentToken(), canGh = REPO_RE.test(S.repo) && !!tok;
  const path = 'boxes/' + name + '.json';
  return h('div', null, connectCard(name), h('div', { class: 'card' },
    h('table', null, h('tr', null, h('td', null, 'This browser'), h('td', null, rec ? 'rev ' + (rec.box.rev || 0) : '—')), h('tr', null, h('td', null, 'GitHub ' + (REPO_RE.test(S.repo) ? S.repo : '')), h('td', null, rem ? 'rev ' + (rem.rev || 0) : (S.remote ? 'not there' : 'not checked'))), h('tr', null, h('td', null, 'Status'), h('td', null, chip(st.t, st.c) || '—'))),
    ghUrl('boxes') ? h('p', { class: 'small', id: 'ghLinks' }, ghLink('Open on GitHub ↗', 'blob/main/boxes/' + name + '.json'), ' · ', ghLink('History ↗', 'commits/main/boxes/' + name + '.json'), ' · ', ghLink('Upload a file ↗', 'upload/main/boxes')) : null,
    h('div', { class: 'row' },
      h('button', { class: 'primary', id: 'pushBtn', disabled: !rec || !canGh, on: { click: act(async () => { let sha; try { sha = await saveToGitHub(S.repo, tok, JSON.stringify(rec.box, null, 2), rec.box.rev || 0, undefined, path); } catch (e) { if (e.name === 'RemoteNewer') { await refreshRemote(); render(); } throw e; } await refreshRemote(); say(sha === 'unchanged' ? 'GitHub already has exactly this box.' : 'Saved to GitHub (commit ' + sha.slice(0, 7) + ').'); }) } }, 'Push to GitHub'),
      h('button', { id: 'pullBtn', disabled: !rem || !tok, on: { click: act(async () => { const fresh = await fetchRemote(S.repo, tok, name); if (!fresh) throw new Error('That box is no longer on GitHub.'); const l = rec && rec.box; if (l && (l.rev || 0) > (fresh.rev || 0) && S.confirm !== 'pull') { S.confirm = 'pull'; say('Your copy here is newer than GitHub. Press Pull again to replace it.', true); return; } S.confirm = ''; await lib.put(name, fresh); await reload(); if (S.remote) S.remote[name] = fresh; say('Pulled rev ' + (fresh.rev || 0) + '.'); }) } }, 'Pull from GitHub'),
      h('button', { id: 'dlBtn', disabled: !rec, on: { click: () => download(JSON.stringify(rec.box, null, 2), name + '.json') } }, 'Download the file'),
      rec ? confirmBtn('del', 'Delete from this browser', async () => { delete S.unlocked[name]; await lib.del(name); await reload(); location.hash = '#/'; say('Deleted "' + name + '" from this browser. GitHub is untouched.'); }, 'danger') : null),
    ));
}

// ---------- Keys ----------
async function readLabelOrNone() { try { return await readLabel(); } catch (e) { if (e.original === 'NotAllowedError') return ''; throw e; } }
function keysView() {
  const labelIn = h('input', { id: 'labelName', placeholder: 'a name, e.g. hk-bag', maxlength: 64 });
  const map = new Map();
  for (const r of S.boxes) for (const k of keysOf(r.box)) { const e = map.get(k.id) || { id: k.id, names: new Set(), boxes: [] }; e.names.add(k.name); e.boxes.push(r.name); map.set(k.id, e); }
  const all = [...map.values()];
  return h('div', null, h('div', { class: 'row sp' }, h('h1', null, 'Security keys ', helpButton('keys')),
      h('div', { class: 'row' }, h('button', { id: 'testKey', on: { click: act(async () => { S.probe = await withKey(probeKey); }) } }, 'Test the plugged-in key'), h('button', { class: 'primary', id: 'detectAll', on: { click: act(async () => { if (!all.length) throw new Error('No security keys are known here yet. They belong to boxes: make a box, or import one, then Detect can recognise its keys.'); const id = await detect(all.map((e) => e.id)); S.detected = id; const e = map.get(id); say(e ? '"' + [...e.names].join(', ') + '" is inserted.' : 'A key answered that is not in any box here.'); }) } }, 'Detect the inserted key (PIN, touch)'))),
    h('p', { class: 'muted small' }, 'A web page cannot see which key is plugged in until you use it. Detection asks the key to sign (most keys, like yours, ask for the PIN and a touch) and matches its answer to the keys listed in your boxes. A wrong PIN uses up one of the tries the key allows.'),
    h('div', { class: 'card', id: 'labelCard' }, h('h2', null, 'Name a key ', helpButton('labels')),
      h('p', { class: 'muted small' }, 'Write a name on the plugged-in key itself, so you can tell your identical keys apart later. It is stored on the key (one of its free slots), readable only by this site, and wiped if the key is reset. Needs the PIN and a touch.'),
      h('label', { for: 'labelName' }, 'Key label'), h('div', { class: 'row' }, labelIn, h('button', { id: 'labelBtn', on: { click: act(async () => { const v = labelIn.value.trim(); await withKey(() => writeLabel(v)); say('The label "' + v + '" is written on the key.'); }) } }, 'Write it on the key'),
        h('button', { id: 'whoBtn', on: { click: act(async () => { const v = await withKey(readLabelOrNone); S.who = v ? 'This key says: "' + v + '".' : 'No label found on this key (or the request was cancelled).'; say(S.who); }) } }, 'Who is this? (PIN, touch)')),
      S.who ? h('p', { id: 'whoResult' }, S.who) : null),
    S.probe ? h('div', { class: 'card', id: 'probeResult' }, h('h2', null, 'The key answered'),
      h('p', null, S.probe.pin === false ? 'It did not verify your PIN: it may have no PIN set.' : S.probe.pin ? 'PIN verified: yes.' : 'PIN verification: not reported by this browser.'),
      h('p', null, S.probe.prf ? 'Can hold a box key (PRF / hmac-secret): yes.' : 'Can hold a box key (PRF / hmac-secret): NO. This key cannot be used for boxes.'),
      h('p', { class: 'muted small' }, 'It cannot be told apart from your other keys until it is enrolled in a box.')) : null,
    all.length ? h('div', { class: 'card' }, h('table', null, h('tr', null, h('th', null, 'Security key'), h('th', null, 'Credential'), h('th', null, 'Opens')),
      all.map((e) => h('tr', null, h('td', null, h('strong', null, [...e.names].join(', ')), ' ', S.detected === e.id ? chip('inserted now', 'live') : null), h('td', { class: 'muted small' }, shortId(e.id)),
        h('td', null, e.boxes.map((b) => h('a', { class: 'chip', href: '#/box/' + encodeURIComponent(b) }, b)))))))
      : h('div', { class: 'card empty', id: 'noKeys' }, h('p', null, 'No security keys known in this browser yet.'), h('p', { class: 'small' }, 'Security keys belong to boxes. Make a box (Boxes → New box), or import or pull one, and its keys appear here. A key can only be recognised once some box lists it.')));
}

// ---------- Settings ----------
function settingsView() {
  const repo = h('input', { id: 'repoIn', class: 'wide', value: S.repo, placeholder: 'owner/name, e.g. paolino/fido-box' }), tok = h('input', { id: 'tokIn', class: 'wide', type: 'password', autocomplete: 'off', placeholder: 'github_pat_…' });
  const helpNote = h('p', { id: 'inlineHelpNote', class: 'muted small', role: 'status' }, 'Show question-mark buttons beside actions and concepts. Your choice is saved in this browser; Documentation is always available.');
  const helpToggle = h('input', { id: 'inlineHelp', type: 'checkbox', checked: inlineHelpEnabled(), 'aria-describedby': 'inlineHelpNote', on: { change: (event) => {
    const saved = setInlineHelp(event.target.checked);
    helpNote.textContent = saved ? 'Inline help ' + (event.target.checked ? 'enabled' : 'disabled') + '. Saved in this browser.' : 'Changed for this page session. Browser storage is unavailable, so this choice cannot be remembered after reload.';
  } } });
  return h('div', null, h('h1', null, 'Settings'),
    h('p', { class: 'muted' }, 'Choose where your encrypted boxes are backed up. Appearance is always available in the header.'),
    h('div', { class: 'card' }, h('h2', null, 'Help and documentation'), h('label', { class: 'check-row', for: 'inlineHelp' }, helpToggle, 'Show inline help'), helpNote, h('a', { href: '#/docs' }, 'Open documentation →')),
    h('div', { class: 'card' }, h('h2', null, 'Box repository ', helpButton('sync')), h('p', { class: 'muted small' }, 'One GitHub repository holds the boxes as boxes/NAME.json. The name is not secret; it is remembered in this browser.'), h('label', { for: 'repoIn' }, 'GitHub repository (owner/name)'), repo,
      h('p', null, h('button', { class: 'primary', id: 'saveRepo', on: { click: act(async () => { const v = repo.value.trim(); if (!REPO_RE.test(v)) throw new Error('Use owner/name.'); S.repo = v; try { localStorage.setItem('box-repo', v); } catch (e) {} S.remote = null; say('Repository set.'); }) } }, 'Save'))),
    h('div', { class: 'card' }, h('h2', null, 'GitHub access ', helpButton('tokens')), h('p', { class: 'muted small' }, 'Normally the token is kept inside a box and used once you unlock it. To look at GitHub before unlocking anything, paste a token for this session only; it is not stored. Create one at ',
      h('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener noreferrer' }, 'github.com/settings/personal-access-tokens/new'), ': only the box repository, Contents read and write.'),
      h('label', { for: 'tokIn' }, 'GitHub token'), tok, h('p', { class: 'row' }, h('button', { id: 'useTok', on: { click: act(async () => { S.token = tok.value.trim(); tok.value = ''; await refreshRemote(); say(S.remote ? 'Connected: ' + Object.keys(S.remote).length + ' box(es) on GitHub.' : S.remoteErr, !S.remote); }) } }, 'Use for this session'),
        S.token ? h('button', { on: { click: () => { S.token = ''; S.remote = null; render(); } } }, 'Forget it') : null)));
}

// ---------- routing ----------
function render() {
  const parts = location.hash.replace(/^#\/?/, '').split('/'), view = parts[0];
  for (const id of ['boxes', 'keys', 'docs', 'settings']) {
    const link = document.getElementById('n-' + id), active = (view || 'boxes') === id || (id === 'boxes' && view === 'box');
    link.className = active ? 'on' : '';
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
  const node = view === 'box' ? boxView(decodeURIComponent(parts[1] || '')) : view === 'keys' ? keysView() : view === 'docs' ? documentationView() : view === 'settings' ? settingsView() : boxesView();
  $app.replaceChildren(node);
  if (view === 'docs' && parts[1]) document.getElementById('docs-' + parts[1])?.focus();
}
document.getElementById('where').textContent = RP === 'localhost' ? 'rehearsal on localhost' : RP;
document.querySelector('.skip-link').addEventListener('click', (event) => { event.preventDefault(); $app.focus(); });
window.addEventListener('hashchange', () => { closeHelp(); S.confirm = ''; render(); });
reload().then(render).catch((e) => { $app.textContent = 'This browser cannot keep a library of boxes: ' + e.message; });
// which commit of the code is being served (the deployment writes COMMIT next to the app)
fetch('COMMIT', { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).then((t) => { const sha = t.trim(); if (/^[0-9a-f]{40}$/.test(sha)) { const a = document.getElementById('commitLink'); a.textContent = sha.slice(0, 7); a.href = 'https://github.com/lambdasistemi/fido2box/commit/' + sha; a.hidden = false; } }).catch(() => {});
