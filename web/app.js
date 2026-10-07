// fido2box: manage locked boxes (the library in this browser and a GitHub repository). Everything runs in the page.
import { inspectBox, readSource } from './box-format.js';
import { createBoxSessions } from './box-session.js';
import { createRecordSession } from './record-session.js';
import { createClipboardController } from './clipboard.js';
import { element as h } from './dom.js';
import { safeUrl } from './url.js';
import { RP, unlockVault, enrolKey, enrolKnownKey, detectKey, probeKey, writeLabel, readLabel } from './webauthn.js';
import { NAME_RE, listRemote, fetchRemote, saveToGitHub } from './github.js';
import { lib, backups } from './store.js';
import { helpButton, inlineHelpEnabled, setInlineHelp, closeHelp, documentationView } from './guidance.js';
const $app = /** @type {HTMLElement} */(document.getElementById('app')), $status = /** @type {HTMLElement} */(document.getElementById('status'));
/** @typedef {import('./store.js').StoredBox} StoredBox */
/** @typedef {import('./box-format.js').SourceDocument} SourceDocument */
/** @typedef {import('./box-session.js').SessionView} SessionView */
/** @typedef {{id:string,names:Set<string>,boxes:Set<string>}} KnownKey */
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
/** @type {{who:string,probe:Awaited<ReturnType<typeof probeKey>>|null,boxes:StoredBox[],remote:Record<string,SourceDocument>|null,remoteErr:string,retained:import('./store.js').Backup[],tab:string,repo:string,token:string,detected:string,confirm:string,newOpen:boolean,busy:boolean}} */
const S = { who: '', probe: null, boxes: [], remote: null, remoteErr: '', retained: [], tab: 'items', repo: '', token: '', detected: '', confirm: '', newOpen: false, busy: false };
const storedRepo = () => { try { return localStorage.getItem('box-repo') || ''; } catch (e) { return ''; } };
S.repo = new URLSearchParams(location.search).get('repo') || storedRepo() || ((/** @type {Window & {BOX_DEFAULTS?:{repo?:string}}} */(window).BOX_DEFAULTS || {}).repo || '');
const L = { e_cancel: 'Cancelled or timed out. Touch the key when it answers.', e_nokey: 'This browser or key cannot do this (use Chrome or Edge with the key plugged in).', e_uv: 'The key did not verify you (PIN). Try again.', e_other: 'Something went wrong: ' };

/** @type {number|undefined} */ let statusTimer;
/** @param {string} msg @param {boolean} [bad] */
function say(msg, bad) { $status.textContent = msg; $status.className = bad ? 'bad' : ''; $status.style.display = 'block'; clearTimeout(statusTimer); statusTimer = setTimeout(() => { $status.style.display = 'none'; }, bad ? 7000 : 3500); }
/* GitHub errors carry no private record values. */
/** @param {unknown} error */
const errorInfo = error => /** @type {{name?:string,message?:string,original?:string,rev?:number}} */(error || {});
/** @param {unknown} error */
const ghError = (error) => { const e=errorInfo(error); const messages=/** @type {Record<string,()=>string>} */({
  RemoteNewer: () => 'GitHub already has a newer version (rev ' + e.rev + '). Pull it first.',
  BadToken: () => 'GitHub refused the token. It may have expired: make a new one.',
  NoRepo: () => 'The token cannot see that repository, or it does not exist.',
  Conflict: () => 'The file changed on GitHub meanwhile. Refresh and try again.',
  TypeError: () => 'Could not reach GitHub.', UnsupportedRemote: () => 'The remote format cannot safely be overwritten. Download and inspect its original file.' });return (messages[e.name||''] || (() => 'GitHub request failed.'))(); };
/** @param {unknown} e */
const errText = (e) => (['RemoteNewer', 'BadToken', 'NoRepo', 'Conflict', 'GitHubError', 'TypeError','UnsupportedRemote'].includes(errorInfo(e).name||'') ? ghError(e) : (errorInfo(e).name === 'NoUV' ? L.e_uv : niceError(e, L)));
// A handler runs once at a time (its own flag): a key waiting for a touch must not freeze the other buttons.
// On an error show it and keep the form as it is (no re-render, so nothing typed is lost).
/** @param {(event:any)=>Promise<void>} f @param {{keep?:boolean}} [opts] */
const act = (f, opts) => { let running = false; return async (/** @type {any} */ ev) => {
  if (running) { say('Still waiting: touch the key, or wait for it to time out (one minute).', true); return; }
  running = true; let failed = false;
  try { await f(ev); } catch (e) { failed = true; say(errText(e), true); } finally { running = false; if (!failed && !(opts && opts.keep)) render(); } }; };
let keyBusy = false;
/** @template T @param {()=>Promise<T>} f @returns {Promise<T>} */
async function withKey(f) {
  if (keyBusy) throw new Error('Still waiting for the key: touch it, or wait for it to time out (one minute).');
  keyBusy = true; say('Waiting for your key: enter its PIN if asked, then touch it.');
  try { return await f(); } finally { keyBusy = false; }
}
/** @param {string[]} ids */
const detect = (ids) => withKey(() => detectKey(ids));
// the words shown for the errors a browser or a key can raise
/** @param {unknown} error @param {typeof L} words */
function niceError(error, words) {
  const e=errorInfo(error), n=e.name, L=words;
  if (n === 'InvalidStateError') return 'This key is already registered in an available box. Choose Identify my key to reuse its existing name.';
  if (n === 'NotAllowedError' || n === 'AbortError') return L.e_cancel;
  if (n === 'NoPrf' || n === 'NotSupportedError' || n === 'SecurityError') return L.e_nokey;
  return L.e_other + ((e && (e.message || n)) || '');
}

// ---------- data ----------
async function reload() { S.boxes = await lib.list(); S.retained = await backups.list(); }
/** @param {string} name */
const local = (name) => S.boxes.find((b) => b.name === name);
/** @param {string} u */
const hostOf = (u) => { const s = safeUrl(u); return s ? new URL(s).host : 'no address'; };
/** @param {string} id */
const shortId = (id) => id.replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
/** @param {unknown} value */
const keysOf = value => { const box = inspectBox(value).box; return box ? box.v === 1 ? box.entries : box.keys : []; };
/** @param {unknown} value */
const revision = value => inspectBox(value).box?.rev || 0;
const currentToken = () => S.token || S.boxes.flatMap(rec => sessions.get(rec.name)?.payloads || []).find(p => p.type === 'github-token')?.secret || '';
/** @param {unknown} localBox @param {unknown} remoteBox */
function sync(localBox, remoteBox) {
  if (localBox && !remoteBox) return S.remote ? { t: 'only here', c: 'warn' } : { t: '', c: '' };
  if (!localBox && remoteBox) return { t: 'only on GitHub', c: 'warn' };
  if (JSON.stringify(localBox) === JSON.stringify(remoteBox)) return { t: 'in sync', c: 'ok' };
  const a = revision(localBox), b = revision(remoteBox);
  return a > b ? { t: 'ahead of GitHub', c: 'warn' } : a < b ? { t: 'behind GitHub', c: 'warn' } : { t: 'differs from GitHub', c: 'bad' };
}
async function refreshRemote() {
  S.remote = null; S.remoteErr = '';
  const tok = currentToken();
  if (!REPO_RE.test(S.repo)) { S.remoteErr = 'Set the repository in Settings.'; return; }
  if (!tok) { S.remoteErr = 'Not connected: unlock a box that holds a GitHub token, or paste one in Settings.'; return; }
  try { const names = await listRemote(S.repo, tok); const boxes = /** @type {Record<string,SourceDocument>} */ ({}); await Promise.all(names.map(async (n) => { const source=await fetchRemote(S.repo, tok, n); if(source)boxes[n]=source; })); S.remote = boxes; }
  catch (e) { S.remoteErr = ghError(e); }
}
const sessions = createBoxSessions({storage:lib,backups,newId:()=>crypto.randomUUID(),rpId:RP,unlock:box=>withKey(()=>unlockVault(box)),enrol:(name,data)=>withKey(()=>enrolKey(name,data))});
/** @type {Record<string,string>} */
const messages = {
  Saved:'Record saved.', SavedRefreshFailed:'Saved, but the view could not refresh. Reload to view the saved box.',
  Stale:'The box changed or locked. Unlock it again before editing.', Conflict:'The saved box changed. Unlock the current copy before editing.',
  Unsupported:'Read-only: this box contains unsupported data. Download the original file from Sync.',
  Invalid:'This change is not valid.', MigrationRequired:'Migration was not approved. The original box is unchanged.',
  BackupFailed:'Could not retain and verify the encrypted backup. The original box is unchanged.',
  StorageFailed:'Could not save. Your draft and the previous saved box are unchanged.',
  AuthFailed:'The box could not be unlocked. Check the key and try again.',
  Copied:'Copied. Clearing after one minute is best effort; clipboard history may retain it.',
  CopyFailed:'Could not copy. Check clipboard permissions.', ClearFailed:'Could not clear the clipboard: clear it yourself.', Cleared:'Clipboard cleared (best effort).'
};
/** @param {string} code */
const notice = code => say(messages[code] || niceError({name:code},L), !['Saved','Copied','Cleared'].includes(code));
/** @template T @param {import('./records.js').Result<T>} result @returns {T} */
const requireResult = result => { if(!result.ok) throw Object.assign(new Error(messages[result.code] || niceError({name:result.code},L)),{name:'OperationFailed'}); return result.value; };
const clipboard = createClipboardController({
  readText:()=>navigator.clipboard.readText(),writeText:value=>navigator.clipboard.writeText(value),
  fingerprint:async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(byte=>byte.toString(16).padStart(2,'0')).join(''),
  schedule:(callback,delay)=>window.setTimeout(callback,delay),cancel:id=>clearTimeout(id),notice
});
/** @param {SessionView} view */
const approveMigration = async view => confirm('Migrate this v'+view.version+' box to v3? A verified encrypted backup will be retained before saving. The complete legacy values and key wrappers are preserved. Older fido2box releases cannot safely edit the result. Download the backup from Boxes or Sync; browser data loss can erase both copies.');
const records = createRecordSession({boxes:sessions,copy:value=>clipboard.copy(value),confirmDiscard:()=>confirm('Discard unsaved changes or delete this record?'),approveMigration,notice,newId:()=>crypto.randomUUID(),refresh:async()=>{await reload();render();}});
let recordBox = '';
/** @param {string} name */
async function unlock(name) { requireResult(await sessions.unlock(name)); if (!S.remote && currentToken()) await refreshRemote(); }
/** @param {string} name @param {import('./box-session.js').BoxMutation} mutation */
async function mutate(name, mutation) {
  const view=sessions.get(name); if(!view)throw new Error('Unlock the box first.');
  let approval=null;
  if(view.version!==3) approval=requireResult(await sessions.prepareMigration(name,view.token,await approveMigration(view)));
  const result=requireResult(await sessions.mutate(name,view.token,mutation,approval));
  try { await reload(); } catch {notice('SavedRefreshFailed');}
  return result;
}
/** @param {string} [name] */
function retainedBackups(name) {
  const entries=S.retained.filter(backup=>name===undefined||backup.name===name);
  return entries.length?h('section',{class:'card'},h('h2',null,'Retained backups'),h('p',{class:'small'},'Encrypted originals, including deleted boxes. Download a copy: browser data loss can erase these backups.'),
    entries.map(backup=>h('p',null,backup.name+' · '+new Date(backup.createdAt).toLocaleString()+' ',h('button',{on:{click:()=>download(backup.sourceText,backup.name+'-before-migration-'+backup.id+'.json')}},'Download pre-migration backup')))):null;
}
/** @param {string} text @param {string} file */
function download(text, file) { const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: file }); a.click(); }
/** @param {string} key @param {string} label @param {()=>Promise<void>} doIt @param {string} [cls] */
const confirmBtn = (key, label, doIt, cls) => S.confirm === key
  ? h('span', null, h('button', { class: 'danger', on: { click: act(async () => { S.confirm = ''; await doIt(); }) } }, 'Yes, ' + label.toLowerCase()), ' ', h('button', { on: { click: () => { S.confirm = ''; render(); } } }, 'Keep'))
  : h('button', { class: cls || '', on: { click: () => { S.confirm = key; render(); } } }, label);
/** @param {string} t @param {string} [c] */
const chip = (t, c) => (t ? h('span', { class: 'chip ' + (c || '') }, t) : null);
/** @param {string} p */
const ghUrl = (p) => (REPO_RE.test(S.repo) ? 'https://github.com/' + S.repo + '/' + p : '');
/** @param {string} text @param {string} p @param {string} [cls] */
const ghLink = (text, p, cls) => (ghUrl(p) ? h('a', { class: cls || '', href: ghUrl(p), target: '_blank', rel: 'noopener noreferrer', on: { click: (e) => e.stopPropagation() } }, text) : null);

// ---------- naming the key you are about to add ----------
// Nicknames are public box metadata: recognizing a key never requires unlocking.
function knownKeys() {
  /** @type {Map<string,KnownKey>} */ const map = new Map();
  const records = [...S.boxes, ...Object.entries(S.remote || {}).map(([name, source]) => ({ name, box:source.value }))];
  for (const r of records) {
    const rpId=inspectBox(r.box).box?.rpId; if (rpId && rpId !== RP) continue;
    for (const k of keysOf(r.box)) {
      const e = map.get(k.id) || { id: k.id, names: new Set(), boxes: new Set() };
      e.names.add(k.name); e.boxes.add(r.name); map.set(k.id, e);
    }
  }
  return [...map.values()];
}
/** @param {string} id @param {readonly string[]} inThisBox */
function keyPicker(id, inThisBox) {
  const known = knownKeys(), first = (/** @type {KnownKey} */ e) => [...e.names][0];
  /** @type {KnownKey|null} */ let selected = null; let manual = !known.length;
  const hint = h('p', { class: 'small', id: id + 'Hint', role: 'status' });
  const input = h('input', { id, placeholder: 'e.g. home key or spare key', maxlength: 64, 'aria-describedby': id + 'Why' });
  const read = h('button', { id: id + 'Label', type: 'button', on: { click: act(async () => {
    const v = await withKey(readLabelOrNone);
    if (v) { input.value = v; hint.textContent = 'Label read: "' + v + '". This suggests a nickname; it does not identify a box key.'; }
    else hint.textContent = 'No label was read. It may be missing, or the request was cancelled. You can leave the nickname blank.';
  }, { keep: true }) } }, 'Read a label stored on the key');
  const fields = h('div', { hidden: !manual }, h('label', { for: id }, 'Nickname (optional)'), input,
    h('p', { id: id + 'Why', class: 'muted small' }, 'A nickname helps you tell your keys apart in box lists. It is not a password and does not unlock anything. It is saved with the box, not written on the key. Leave it blank for an automatic name.'), read);
  const useNew = h('button', { id: id + 'Manual', type: 'button', on: { click: () => {
    selected = null; manual = true; fields.hidden = false; input.readOnly = false;
    hint.textContent = 'Use this for a key not registered in the available boxes. A known key will be refused: identify it above to reuse its name.';
    input.focus();
  } } }, 'Use an unregistered key');
  const find = h('button', { id: id + 'Find', type: 'button', class: 'primary', disabled: !known.length, on: { click: act(async () => {
    selected = null;
    hint.textContent = 'Waiting for identification. Touch the key when asked.';
    let got;
    try { got = await detect(known.map((x) => x.id)); }
    catch (e) {
      if (!['NotAllowedError', 'AbortError'].includes(errorInfo(e).original||'')) throw e;
      hint.textContent = 'Could not identify the key. The request may have been cancelled, timed out, or no available box matched. This does not mean the key is new. Try again, import its box, or use an unregistered key.';
      return;
    }
    selected = known.find((e) => e.id === got) || null;
    if (!selected) { hint.textContent = 'No matching key was found in the available boxes. Import its box or try again.'; return; }
    manual = false; fields.hidden = true; input.value = first(selected); input.readOnly = true;
    hint.textContent = inThisBox.includes(selected.id)
      ? '"' + first(selected) + '" is already in this box. Plug in a different key and identify it.'
      : 'Recognized "' + first(selected) + '" from: ' + [...selected.boxes].join(', ') + '. This name will be reused. Keep this key plugged in to continue.';
    if (selected.names.size > 1) hint.textContent += ' Other names recorded for this credential: ' + [...selected.names].slice(1).join(', ') + '. Existing boxes will not be renamed.';
  }, { keep: true }) } }, 'Identify my key');
  return {
    node: h('div', { class: 'key-picker' },
      h('p', { class: 'muted small' }, known.length
        ? 'Identify your key to reuse its name. We check available boxes, including locked ones, without unlocking them. Plug in only the key you want to use.'
        : 'No box keys are available to recognize yet. If you have used this key before, import its box first—even a locked box is enough. Otherwise continue with an optional nickname.'),
      h('div', { class: 'row' }, find, known.length ? useNew : null), hint, fields),
    /** @returns {(data:BufferSource)=>Promise<import('./box-format.js').KeyEntry>} */
    enrollment() {
      if (selected) {
        if(inThisBox.includes(selected.id)) throw new Error('That key is already in this box.');
        const key={id:selected.id,name:first(selected)};
        return data=>withKey(()=>enrolKnownKey(key,data));
      }
      if (!manual) throw new Error('Identify your key first, or choose “Use an unregistered key”.');
      const names = new Set(known.flatMap((e) => [...e.names]));
      let name = input.value.trim();
      if (name && names.has(name)) throw new Error('That nickname is already used. Identify the known key, or choose a different nickname for a different key.');
      if (!name) { let n = 1; while (names.has('Security key ' + n)) n++; name = 'Security key ' + n; }
      return data=>withKey(() => enrolKey(name, data, known.map((e) => e.id)));
    }
  };
}
// ---------- Boxes ----------
function boxesView() {
  const names = [...new Set([...S.boxes.map((b) => b.name), ...Object.keys(S.remote || {})])].sort();
  const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, id: 'importFile', on: { change: act(async (ev) => {
    const f = ev.target.files[0]; if (!f) return; const source=readSource(await f.text());
    if (!source.ok || typeof source.value.value!=='object' || source.value.value===null || !Object.hasOwn(source.value.value,'v')) throw new Error('That file is not a box.');
    const name = f.name.replace(/\.json$/i, '').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 40) || 'box';
    if (local(name)) throw new Error('A box named "' + name + '" is already in this browser. Delete it first, or rename the file.');
    requireResult(await sessions.replace(name,null,source.value)); await reload(); say('Imported "' + name + '".'); ev.target.value = ''; }) } });
  const nameIn = h('input', { id: 'newName', placeholder: 'box name, e.g. paolo', maxlength: 40 }), kp = keyPicker('newKey', []);
  const form = S.newOpen ? h('div', { class: 'card' }, h('h2', null, 'New box ', helpButton('create')),
    h('label', { for: 'newName' }, 'Name (letters, digits, - and _)'), nameIn, h('h3', null, 'Security key'), kp.node,
    h('p', { class: 'muted small' }, 'Plug in the hardware security key you will open this box with, and only that one. A recognized key asks for its PIN and a touch. An unregistered key asks twice.'),
    h('div', { class: 'row' }, h('button', { class: 'primary', id: 'createBox', on: { click: act(async () => {
      const name = nameIn.value.trim();
      if (!NAME_RE.test(name)) throw new Error('The name may use letters, digits, - and _ (up to 40).'); if (local(name)) throw new Error('A box with that name already exists here.');
      const enroll=kp.enrollment(); requireResult(await sessions.create(name,'',RP,enroll)); await reload(); S.newOpen = false; location.hash = '#/box/' + name; say('Created "' + name + '".'); }) } }, 'Create'),
      h('button', { on: { click: () => { S.newOpen = false; render(); } } }, 'Cancel'))) : null;
  const rows = names.map((n) => { const l = local(n), r = S.remote && S.remote[n], st = sync(l && l.box, r?.value), b = (l && l.box) || r?.value;
    return h('tr', { class: 'click', on: { click: () => { location.hash = '#/box/' + encodeURIComponent(n); } } },
      h('td', null, h('a', { class: 'box-link', href: '#/box/' + encodeURIComponent(n) }, n), ' ', sessions.get(n) ? chip('unlocked', 'live') : null),
      h('td', null, l ? chip('this browser') : null, r ? ghLink('GitHub ↗', 'blob/main/boxes/' + n + '.json', 'chip') : null),
      h('td', null, h('span', { class: 'mobile-label' }, 'Keys: '), String(keysOf(b).length)), h('td', null, 'rev ' + revision(b)), h('td', null, chip(st.t, st.c))); });
  return h('div', null,
    h('div', { class: 'row sp' }, h('h1', null, 'Boxes ', helpButton('boxes')), h('div', { class: 'row' },
      h('button', { class: 'primary', id: 'newBtn', on: { click: () => { S.newOpen = true; render(); } } }, 'New box'),
      h('button', { id: 'importBtn', on: { click: () => document.getElementById('importFile')?.click() } }, 'Import file'), helpButton('recovery'),
      h('button', { id: 'refreshBtn', on: { click: act(async () => { await refreshRemote(); if (S.remote) say('GitHub: ' + Object.keys(S.remote||{}).length + ' box(es).'); else say(S.remoteErr, true); }) } }, 'Refresh GitHub'))),
    h('p', { class: 'muted', id: 'intro' }, 'Your secrets, locked with your hardware keys. Each box holds your items; any of its enrolled keys can unlock it.'),
    file, form, retainedBackups(),
    h('p', { class: 'muted small', id: 'ghLine' }, S.remote ? ['GitHub: ', ghLink(S.repo, 'tree/main/boxes'), ', ' + Object.keys(S.remote||{}).length + ' box(es).'] : [S.remoteErr || 'GitHub: not checked.', ...(ghUrl('tree/main/boxes') ? [' ', ghLink('Open the repository ↗', 'tree/main/boxes')] : [])]),
    names.length ? h('div', { class: 'card' }, h('table', null, h('tr', null, h('th', null, 'Name'), h('th', null, 'Where'), h('th', null, 'Security keys'), h('th', null, 'Version'), h('th', null, 'Status')), rows))
      : h('div', { class: 'card empty', id: 'emptyBoxes' }, h('p', null, 'No boxes yet.'), h('p', { class: 'small' }, 'Make a new one, or import a box file. If you are recovering, download your box file from ', REPO_RE.test(S.repo) ? h('a', { href: 'https://github.com/' + S.repo + '/tree/main/boxes', target: '_blank', rel: 'noopener noreferrer' }, S.repo) : 'your repository on GitHub', ' (log in with your key) and import it here.')));
}

// ---------- one box ----------
/** @param {string} name */
function boxView(name) {
  const rec = local(name), rem = S.remote && S.remote[name], U = sessions.get(name);
  const head = h('div', null, h('p', { class: 'small' }, h('a', { href: '#/' }, '← Boxes')),
    h('div', { class: 'row sp' }, h('h1', null, name), h('div', { class: 'row' }, U ? chip('unlocked', 'live') : chip('locked'), U ? h('button', { id: 'lockBtn', on: { click: () => { sessions.lock(name); records.reset('lock'); render(); } } }, 'Lock') : null)));
  if (!rec && !rem) return h('div', null, head, h('div', { class: 'card empty' }, 'No such box.'));
  const tabs = h('div', { class: 'tabs' }, ['items', 'keys', 'sync'].map((t) => h('button', { class: S.tab === t ? 'on' : '', id: 'tab-' + t, on: { click: () => { if(!records.requestLeave())return; records.reset('leave'); S.tab = t; S.confirm = ''; render(); } } }, { items: 'Items', keys: 'Security keys', sync: 'Sync' }[t])), helpButton(S.tab));
  return h('div', null, head, tabs, S.tab === 'keys' ? keysTab(name, rec, U) : S.tab === 'sync' ? syncTab(name, rec, rem) : itemsTab(name, rec, rem, U));
}
/** @param {string} name @param {StoredBox|undefined} rec @param {SourceDocument|null|undefined} rem @param {SessionView|null} U */
function itemsTab(name, rec, rem, U) {
  if (!rec) return h('div', { class: 'card' }, h('p', null, 'This box is only on GitHub. Pull it into this browser to use it.'), h('button', { class: 'primary', on: { click: () => { S.tab = 'sync'; render(); } } }, 'Go to Sync'));
  if (!U) return h('div', { class: 'card empty' }, h('p', null, 'This box is locked.'), h('p', { class: 'small' }, 'Plug in one of its security keys (see the Security keys tab) and press Unlock. The key asks for its PIN and a touch.'),
    h('button', { class: 'primary', id: 'unlockBtn', on: { click: act(async () => { await unlock(name); }) } }, 'Unlock'));
  if(recordBox!==name){records.open(name,null);recordBox=name;}
  return records.render(U);
}

/** @param {string} name @param {StoredBox|undefined} rec @param {SessionView|null} U */
function keysTab(name, rec, U) {
  if (!rec) return h('div', { class: 'card' }, 'Pull this box first.');
  const ks = keysOf(rec.box), kp = keyPicker('kName', ks.map((k) => k.id));
  return h('div', null,
    h('div', { class: 'card' }, h('table', null, ks.map((k, i) => h('tr', null,
      h('td', null, h('strong', null, k.name), ' ', S.detected === k.id ? chip('inserted now', 'live') : null), h('td', { class: 'muted small' }, shortId(k.id)),
      h('td', { class: 'r' }, ks.length > 1 && U ? confirmBtn('k' + i, 'Remove', async () => { await mutate(name,{kind:'remove-key',credentialId:k.id}); }) : h('span', { class: 'muted small' }, ks.length === 1 ? 'the only security key' : 'Unlock to remove'))))),
      h('p', { class: 'muted small' }, 'Removing a key does not revoke it: anyone who ever had it can still open older copies of this box. To revoke, make a new box.'),
      h('button', { id: 'detectBtn', on: { click: act(async () => { const id = await detect(ks.map((k) => k.id)); S.detected = id; const k = ks.find((x) => x.id === id); say(k ? '"' + k.name + '" is inserted.' : 'A key answered that is not in this box.'); }) } }, 'Detect the inserted key (PIN, touch)')),
    h('div', { class: 'card' }, h('h2', null, 'Add a security key'), U ? [kp.node, h('p', { class: 'muted small' }, 'Plug in the hardware key you want to add, and only that one. A recognized key asks for its PIN and a touch; an unregistered key asks twice. Enter the PIN carefully: wrong PINs use up the number of tries the key allows.'),
      h('button', { class: 'primary', id: 'addKey', on: { click: act(async () => { const enroll=kp.enrollment(); await mutate(name,{kind:'add-key',name:'',enrol:enroll}); say('Security key added.'); }) } }, 'Add this security key')]
      : h('p', { class: 'muted' }, 'Unlock the box first (Items tab): adding a security key needs the box open.')));
}
// The three steps that make "Push to GitHub" work: a repository, a token kept inside the box, a connection test.
/** @param {string} name */
function connectCard(name) {
  const U = sessions.get(name), hasTok = !!U && U.payloads.some((i) => i.type === 'github-token'), repoOk = REPO_RE.test(S.repo), conn = !!S.remote;
  const step = (/** @type {number} */ n, /** @type {boolean} */ done, /** @type {string} */ title, /** @type {import('./dom.js').Child[]} */ ...body) => h('div', { class: 'step' }, h('span', { class: 'num' + (done ? ' done' : '') }, done ? '✓' : String(n)), h('div', { class: 'grow' }, h('strong', null, title), ...body));
  const repoIn = h('input', { id: 'repoIn2', value: S.repo, placeholder: 'owner/name, e.g. paolino/fido-box' }), tokIn = h('input', { id: 'iToken', type: 'password', autocomplete: 'off', placeholder: 'github_pat_…' });
  const tokenHelp = [h('ol', { class: 'muted small' },
      h('li', null, 'Open GitHub\'s token page (the button below) and sign in. A token is a password for this app to write to GitHub; it is not a security key.'), h('li', null, 'Name it, for example fido-box, and pick the longest expiry.'),
      h('li', null, 'Repository access: "Only select repositories", then ', h('code', null, repoOk ? S.repo : 'your box repository'), '.'),
      h('li', null, 'Permissions → Repository permissions → Contents → Read and write. Nothing else.'), h('li', null, 'Generate the token, copy it, and paste it here.')),
    h('p', { class: 'row' }, h('a', { class: 'btn', id: 'openGh', href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener noreferrer' }, 'Open GitHub to create the token')), h('label', { for: 'iToken' }, 'GitHub token'), tokIn,
    h('p', null, h('button', { class: 'primary', id: 'addToken', on: { click: act(async () => { const v = tokIn.value.trim(); if (!v) throw new Error('Paste the token first.');
      await mutate(name,{kind:'set-token',id:U?.payloads.find(p=>p.type==='github-token')?.id||crypto.randomUUID(),url:'https://github.com/settings/personal-access-tokens',secret:v}); say('The token is kept in the box.'); }) } }, 'Keep it in this box'))];
  return h('div', { class: 'card', id: 'connect' }, h('h2', null, 'Connect to GitHub ', helpButton('tokens')),
    step(1, repoOk, 'The repository that holds your boxes',
      repoOk ? h('p', { class: 'muted small' }, S.repo, ' · ', h('a', { href: '#/settings' }, 'change'))
        : [h('label', { for: 'repoIn2' }, 'GitHub repository (owner/name)'), repoIn, h('p', null, h('button', { id: 'saveRepo2', on: { click: act(async () => { const v = repoIn.value.trim(); if (!REPO_RE.test(v)) throw new Error('Use owner/name.'); S.repo = v; try { localStorage.setItem('box-repo', v); } catch (e) {} S.remote = null; say('Repository set.'); }) } }, 'Save'))]),
    step(2, hasTok, 'A GitHub token, kept inside this box',
      hasTok ? [h('p', { class: 'muted small' }, 'A token is kept in this box. It is used only to talk to GitHub, and it is never shown.'), confirmBtn('tok', 'Remove the token', async () => { for(const token of sessions.get(name)?.payloads.filter(p=>p.type==='github-token')||[]) await mutate(name,{kind:'remove-token',id:token.id}); })]
        : U ? tokenHelp : [h('p', { class: 'muted small' }, 'The token is stored inside the box, so unlock the box first.'), h('button', { id: 'goItems', on: { click: () => { S.tab = 'items'; render(); } } }, 'Go to Items to unlock')]),
    step(3, conn, 'Check the connection', h('p', { class: 'muted small', id: 'connState' }, conn ? 'Connected: ' + Object.keys(S.remote||{}).length + ' box(es) on GitHub.' : (S.remoteErr || 'Not checked yet.')),
      h('button', { id: 'testGh', disabled: !repoOk || !currentToken(), on: { click: act(async () => { await refreshRemote(); say(S.remote ? 'Connected: ' + Object.keys(S.remote||{}).length + ' box(es) on GitHub.' : S.remoteErr, !S.remote); }) } }, 'Test the connection')));
}
/** @param {string} name @param {StoredBox|undefined} rec @param {SourceDocument|null|undefined} rem */
function syncTab(name, rec, rem) {
  const st = sync(rec && rec.box, rem?.value), tok = currentToken(), canGh = REPO_RE.test(S.repo) && !!tok;
  const path = 'boxes/' + name + '.json';
  return h('div', null, connectCard(name), retainedBackups(name), h('div', { class: 'card' },
    h('table', null, h('tr', null, h('td', null, 'This browser'), h('td', null, rec ? 'rev ' + revision(rec.box) : '—')), h('tr', null, h('td', null, 'GitHub ' + (REPO_RE.test(S.repo) ? S.repo : '')), h('td', null, rem ? 'rev ' + revision(rem.value) : (S.remote ? 'not there' : 'not checked'))), h('tr', null, h('td', null, 'Status'), h('td', null, chip(st.t, st.c) || '—'))),
    ghUrl('boxes') ? h('p', { class: 'small', id: 'ghLinks' }, ghLink('Open on GitHub ↗', 'blob/main/boxes/' + name + '.json'), ' · ', ghLink('History ↗', 'commits/main/boxes/' + name + '.json'), ' · ', ghLink('Upload a file ↗', 'upload/main/boxes')) : null,
    h('div', { class: 'row' },
      h('button', { class: 'primary', id: 'pushBtn', disabled: !rec || !canGh, on: { click: act(async () => { if(!rec)return; let sha; try { sha = await saveToGitHub(S.repo, tok, rec.sourceText, revision(rec.box), undefined, path); } catch (e) { if (errorInfo(e).name === 'RemoteNewer') { await refreshRemote(); render(); } throw e; } await refreshRemote(); say(sha === 'unchanged' ? 'GitHub already has exactly this box.' : 'Saved to GitHub (commit ' + sha.slice(0, 7) + ').'); }) } }, 'Push to GitHub'),
      h('button', { id: 'pullBtn', disabled: !rem || !tok, on: { click: act(async () => { if(!records.requestLeave())return;
        const expected=rec?.sourceText||null;
        records.reset('replace');sessions.lock(name);const generation=sessions.generation(name);render();
        const fresh=await fetchRemote(S.repo,tok,name); if(sessions.generation(name)!==generation)throw new Error('The box changed or locked during Pull. Try again.'); if(!fresh)throw new Error('That box is no longer on GitHub.');
        if(rec && revision(rec.box)>revision(fresh.value) && S.confirm!=='pull'){S.confirm='pull';say('Your copy here is newer than GitHub. Press Pull again to replace it.',true);return;}
        S.confirm='';records.reset('replace');
        const pending=sessions.replace(name,expected,fresh);render();requireResult(await pending);
        await reload();if(S.remote)S.remote[name]=fresh;say('Pulled rev '+revision(fresh.value)+'.'); }) } }, 'Pull from GitHub'),
      h('button', { id: 'dlBtn', disabled: !rec, on: { click: () => {if(rec)download(rec.sourceText, name + '.json');} } }, 'Download the file'),
      rec ? confirmBtn('del', 'Delete from this browser', async () => { records.reset('lock'); requireResult(await sessions.remove(name,rec.sourceText)); await reload(); location.hash = '#/'; say('Deleted "' + name + '" from this browser. GitHub is untouched.'); }, 'danger') : null),
    ));
}

// ---------- Keys ----------
async function readLabelOrNone() { try { return await readLabel(); } catch (e) { if (errorInfo(e).original === 'NotAllowedError') return ''; throw e; } }
function keysView() {
  const labelIn = h('input', { id: 'labelName', placeholder: 'a name, e.g. hk-bag', maxlength: 64 });
  const all = knownKeys(), map = new Map(all.map((e) => [e.id, e]));
  return h('div', null, h('div', { class: 'row sp' }, h('h1', null, 'Security keys ', helpButton('keys')),
      h('div', { class: 'row' }, h('button', { id: 'testKey', on: { click: act(async () => { S.probe = await withKey(probeKey); }) } }, 'Test the plugged-in key'), h('button', { class: 'primary', id: 'detectAll', on: { click: act(async () => { if (!all.length) throw new Error('No security keys are known here yet. They belong to boxes: make a box, or import one, then Detect can recognise its keys.'); const id = await detect(all.map((e) => e.id)); S.detected = id; const e = map.get(id); say(e ? '"' + [...e.names].join(', ') + '" is inserted.' : 'A key answered that is not in any box here.'); }) } }, 'Detect the inserted key (PIN, touch)'))),
    h('p', { class: 'muted small' }, 'A web page cannot see which key is plugged in until you use it. No box needs to be unlocked. Detection asks the key to sign (most keys, like yours, ask for the PIN and a touch) and matches its answer to the keys listed in local boxes and loaded GitHub boxes. A wrong PIN uses up one of the tries the key allows.'),
    h('div', { class: 'card', id: 'labelCard' }, h('h2', null, 'Optional label stored on the key ', helpButton('labels')),
      h('p', { class: 'muted small' }, 'This is separate from the nickname saved in a box and does not rename existing box entries. Write a label on the plugged-in key itself, so you can tell your identical keys apart later. It is stored on the key (one of its free slots), readable only by this site, and wiped if the key is reset. Needs the PIN and a touch.'),
      h('label', { for: 'labelName' }, 'Key label'), h('div', { class: 'row' }, labelIn, h('button', { id: 'labelBtn', on: { click: act(async () => { const v = labelIn.value.trim(); await withKey(() => writeLabel(v)); say('The label "' + v + '" is written on the key.'); }) } }, 'Write it on the key'),
        h('button', { id: 'whoBtn', on: { click: act(async () => { const v = await withKey(readLabelOrNone); S.who = v ? 'This key says: "' + v + '".' : 'No label found on this key (or the request was cancelled).'; say(S.who); }) } }, 'Who is this? (PIN, touch)')),
      S.who ? h('p', { id: 'whoResult' }, S.who) : null),
    S.probe ? h('div', { class: 'card', id: 'probeResult' }, h('h2', null, 'The key answered'),
      h('p', null, S.probe.pin === false ? 'It did not verify your PIN: it may have no PIN set.' : S.probe.pin ? 'PIN verified: yes.' : 'PIN verification: not reported by this browser.'),
      h('p', null, S.probe.prf ? 'Can hold a box key (PRF / hmac-secret): yes.' : 'Can hold a box key (PRF / hmac-secret): NO. This key cannot be used for boxes.'),
      h('p', { class: 'muted small' }, 'It cannot be told apart from your other keys until it is enrolled in a box.')) : null,
    all.length ? h('div', { class: 'card' }, h('table', null, h('tr', null, h('th', null, 'Security key'), h('th', null, 'Credential'), h('th', null, 'Opens')),
      all.map((e) => h('tr', null, h('td', null, h('strong', null, [...e.names].join(', ')), ' ', S.detected === e.id ? chip('inserted now', 'live') : null), h('td', { class: 'muted small' }, shortId(e.id)),
        h('td', null, [...e.boxes].map((b) => h('a', { class: 'chip', href: '#/box/' + encodeURIComponent(b) }, b)))))))
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
      h('label', { for: 'tokIn' }, 'GitHub token'), tok, h('p', { class: 'row' }, h('button', { id: 'useTok', on: { click: act(async () => { S.token = tok.value.trim(); tok.value = ''; await refreshRemote(); say(S.remote ? 'Connected: ' + Object.keys(S.remote||{}).length + ' box(es) on GitHub.' : S.remoteErr, !S.remote); }) } }, 'Use for this session'),
        S.token ? h('button', { on: { click: () => { S.token = ''; S.remote = null; render(); } } }, 'Forget it') : null)));
}

// ---------- routing ----------
function render() {
  const parts = location.hash.replace(/^#\/?/, '').split('/'), view = parts[0];
  for (const id of ['boxes', 'keys', 'docs', 'settings']) {
    const link = /** @type {HTMLElement} */(document.getElementById('n-' + id)), active = (view || 'boxes') === id || (id === 'boxes' && view === 'box');
    link.className = active ? 'on' : '';
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
  const node = view === 'box' ? boxView(decodeURIComponent(parts[1] || '')) : view === 'keys' ? keysView() : view === 'docs' ? documentationView() : view === 'settings' ? settingsView() : boxesView();
  $app.replaceChildren(node);
  if (view === 'docs' && parts[1]) document.getElementById('docs-' + parts[1])?.focus();
}
/** @type {HTMLElement} */(document.getElementById('where')).textContent = RP === 'localhost' ? 'rehearsal on localhost' : RP;
document.querySelector('.skip-link')?.addEventListener('click', (event) => { event.preventDefault(); $app.focus(); });
let acceptedHash=location.hash;
window.addEventListener('hashchange', () => {
  if(location.hash===acceptedHash)return;
  if(!records.requestLeave()){history.replaceState(null,'',acceptedHash||'#/');return;}
  records.reset('leave');recordBox='';acceptedHash=location.hash;closeHelp();S.confirm='';render();
});
window.addEventListener('beforeunload',event=>{if(records.dirty()){event.preventDefault();event.returnValue='';}});
window.addEventListener('pagehide',()=>{records.reset('lock');for(const rec of S.boxes)sessions.lock(rec.name);clipboard.dispose();});
reload().then(render).catch((e) => { $app.textContent = 'This browser cannot keep a library of boxes: ' + e.message; });
// which commit of the code is being served (the deployment writes COMMIT next to the app)
fetch('COMMIT', { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).then((t) => { const sha = t.trim(); if (/^[0-9a-f]{40}$/.test(sha)) { const a = /** @type {HTMLAnchorElement} */(document.getElementById('commitLink')); a.textContent = sha.slice(0, 7); a.href = 'https://github.com/lambdasistemi/fido2box/commit/' + sha; a.hidden = false; } }).catch(() => {});
