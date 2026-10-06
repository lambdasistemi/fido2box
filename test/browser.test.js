// Real Chrome, real WebAuthn (Chrome's virtual security key with PRF), real IndexedDB, the real app served over http://localhost.
// GitHub is faked inside the page (its CORS rules were checked against the real API by hand).
// Run: node test/browser.test.js   (needs google-chrome / chromium on PATH; skipped when missing)
const { spawn, spawnSync } = require('child_process'); const http = require('http'); const fs = require('fs'); const os = require('os'); const path = require('path');
const chrome = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].find((c) => spawnSync('sh', ['-c', 'command -v ' + c]).status === 0);
if (!chrome) { console.log('skipped: no chrome on PATH'); process.exit(0); }
const WEB = path.join(__dirname, '..', 'web'); let n = 0, fails = 0;
const ok = (c, m) => { n++; if (c) console.log('ok  ' + m); else { fails++; console.log('FAIL ' + m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((q, r) => {
  const p = decodeURIComponent(q.url.split('?')[0]).replace(/^\//, '') || 'index.html';
  if (p === 'COMMIT') { r.writeHead(200); return r.end('0123456789abcdef0123456789abcdef01234567\n'); }
  fs.readFile(path.join(WEB, p), (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'text/plain' }); r.end(d); });
});
// the library, read straight from IndexedDB by the test (the app keeps its own copy of this code in a module)
const LIB_READER = `window.lib = (() => {
  const open = () => new Promise((res, rej) => { const r = indexedDB.open('recover-box', 1); r.onupgradeneeded = () => r.result.createObjectStore('boxes', { keyPath: 'name' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = async (f) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('boxes', 'readonly'), q = f(t.objectStore('boxes')); t.oncomplete = () => { db.close(); res(q.result); }; t.onerror = () => rej(t.error); }); };
  return { list: () => tx((s) => s.getAll()), get: (n) => tx((s) => s.get(n)) };
})();`;
// the fake GitHub, installed in every page before its scripts run
const FAKE_GH = `(() => {
  const gh = window.__gh = { token: 'ghp_FAKE', files: {}, puts: [], auth: [], repoExists: true };
  const real = window.fetch.bind(window);
  const res = (s, b) => new Response(JSON.stringify(b), { status: s });
  window.fetch = async (u, o = {}) => {
    u = String(u); if (!u.startsWith('https://api.github.com/')) return real(u, o);
    const auth = (o.headers || {}).Authorization; gh.auth.push(auth);
    if (auth !== 'Bearer ' + gh.token) return res(401, {});
    const m = u.match(/repos\\/([^/]+\\/[^/]+)(?:\\/contents\\/(.*))?$/); const p = m && m[2];
    if (!o.method || o.method === 'GET') {
      if (!m) return res(404, {});
      if (p === 'boxes') { const l = Object.keys(gh.files).filter((k) => k.startsWith('boxes/')).map((k) => ({ type: 'file', name: k.slice(6) })); return l.length ? res(200, l) : res(404, {}); }
      if (p) return gh.files[p] ? res(200, { sha: 'sha' + gh.puts.length, content: btoa(gh.files[p]) }) : res(404, {});
      return gh.repoExists ? res(200, {}) : res(404, {});
    }
    const b = JSON.parse(o.body); gh.files[p] = atob(b.content); gh.puts.push({ path: p, sha: b.sha, message: b.message }); return res(201, { commit: { sha: 'abc1234def0' } });
  };
})();`;
async function main() {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const base = 'http://localhost:' + server.address().port + '/';
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'box-chrome-'));
  const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((res, rej) => { let b = ''; proc.stderr.on('data', (d) => { b += d; const m = b.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); }); setTimeout(() => rej(new Error('chrome did not start')), 20000); });
  const target = await (await fetch('http://127.0.0.1:' + new URL(wsUrl).port + '/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = {}; const pageErrors = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending[d.id]) { pending[d.id](d); delete pending[d.id]; } else if (d.method === 'Runtime.exceptionThrown') pageErrors.push(d.params.exceptionDetails.exception ? d.params.exceptionDetails.exception.description : d.params.exceptionDetails.text); };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending[i] = (d) => (d.error ? rej(new Error(method + ': ' + d.error.message)) : res(d.result)); ws.send(JSON.stringify({ id: i, method, params })); });
  const run = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result.value; };
  const until = async (expr, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await run(expr).catch(() => false)) return true; await sleep(120); } return false; };
  const q = (s) => `document.querySelector(${JSON.stringify(s)})`;
  const click = (s) => run(`${q(s)}.click()`); const fill = (s, v) => run(`${q(s)}.value = ${JSON.stringify(v)}`);
  const text = () => run('document.body.innerText'); const has = async (t) => (await text()).includes(t);
  const btn = (label) => run(`[...document.querySelectorAll('button,a.btn')].find((b) => b.textContent.trim() === ${JSON.stringify(label)}).click()`);
  const open = async (hash = '') => { await send('Page.navigate', { url: 'about:blank' }); await send('Page.navigate', { url: base + hash }); await sleep(800); };   // always a real reload
  const auth = (extra = {}) => send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'usb', hasResidentKey: false, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true, ...extra } });
  try {
    await send('Page.enable'); await send('Runtime.enable'); await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_GH + LIB_READER }); await send('WebAuthn.enable', { enableUI: false });
    await send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: base.replace(/\/$/, '') }).catch(() => {});
    const key1 = await auth();
    // ===== empty library, make a box =====
    await open();
    ok(await has('No boxes yet'), 'a new browser has an empty library');
    ok((await run(`${q('#codeLink')}.href`)) === 'https://github.com/lambdasistemi/recover-box', 'the top bar links to the code');
    ok((await run(`${q('#commitLink')}.textContent`)) === '0123456' && (await run(`${q('#commitLink')}.href`)).endsWith('/commit/0123456789abcdef0123456789abcdef01234567'), 'the top bar shows and links the commit being served');
    await open('#/keys');
    ok(await has('No security keys known in this browser yet') && (await run(`!${q('#detectAll')}.disabled`)), 'Keys view with no boxes: Detect is not greyed out and the page explains why there is nothing to detect');
    await click('#detectAll'); await sleep(300);
    ok(await has('No security keys are known here yet'), 'pressing Detect with no known keys says what to do');
    await click('#testKey'); await until(`!!${q('#probeResult')}`);
    ok(await has('PIN verified: yes') && await has('PRF / hmac-secret): yes'), 'Test the plugged-in key works with no box at all: PIN verified, PRF supported');
    ok((await run(`lib.list().then((l) => l.length)`)) === 0, 'testing a key stores nothing in the library');
    await open();
    // password managers are told to ignore every input (this page holds no logins)
    await click('#newBtn'); await sleep(250);
    ok(await run(`[...document.querySelectorAll('input')].every((i) => i.hasAttribute('data-1p-ignore') && i.getAttribute('data-lpignore') === 'true' && i.hasAttribute('data-bwignore'))`) && (await run(`document.querySelectorAll('input').length`)) > 0, 'every input on the page tells password managers to ignore it');
    await click('#newBtn'); await fill('#newName', 'bad name!'); await fill('#newKey', 'hk-home'); await click('#createBox'); await sleep(500);
    ok(await has('letters, digits'), 'a bad box name is refused');
    await fill('#newName', 'paolo'); await click('#createBox');
    ok(await until(`location.hash === '#/box/paolo' && !!${q('#lockBtn')}`), 'creating a box with a key (real WebAuthn + PRF) opens it, unlocked');
    const rec = JSON.parse(await run(`lib.get('paolo').then((r) => JSON.stringify(r.box))`));
    ok(rec.v === 2 && rec.rev === 1 && rec.keys.length === 1 && rec.keys[0].name === 'hk-home' && rec.rpId === 'localhost', 'library record: v2, rev 1, key hk-home, rpId localhost');
    // ===== items =====
    for (const [nm, u, s] of [['1Password', 'https://my.1password.com/signin', 'A3-SECRET-ONE'], ['Google', 'https://accounts.google.com', 'g-code-two']]) { await fill('#iName', nm); await fill('#iUrl', u); await fill('#iSecret', s); await click('#addItem'); await sleep(500); }
    await fill('#iName', 'Bad'); await fill('#iUrl', 'javascript:alert(1)'); await fill('#iSecret', 'x'); await click('#addItem'); await sleep(400);
    ok(await has('must start with https'), 'a javascript: address is refused');
    ok((await text()).includes('1Password') && (await text()).includes('accounts.google.com'), 'items listed with their host');
    ok(!(await text()).includes('A3-SECRET-ONE') && !(await run('document.documentElement.outerHTML')).includes('A3-SECRET-ONE'), 'secrets are not in the page');
    const stored = await run(`lib.list().then((l) => JSON.stringify(l))`);
    ok(!/1Password|google|A3-SECRET|g-code/i.test(stored), 'what is stored in the library leaks no title, address or secret');
    ok((await run(`${q('a.btn')}.href`)) === 'https://my.1password.com/signin', 'Open goes to the address');
    ok(await run(`${q('a.btn')}.rel`).then((r) => r.includes('noopener')), 'Open is noopener');
    await run(`document.querySelectorAll('button.copy')[1].click()`); await sleep(300);
    ok((await run(`navigator.clipboard.readText()`).catch((e) => 'ERR ' + e.message)) === 'g-code-two', 'Copy puts that item\'s secret on the real clipboard');
    // delete needs a second click
    await run(`[...document.querySelectorAll('button')].filter((b) => b.textContent === 'Delete')[0].click()`); await sleep(150);
    ok((await text()).includes('1Password'), 'delete: the first click only asks');
    await btn('Yes, delete'); await sleep(500);
    ok(!(await text()).includes('1Password') && (await text()).includes('Google'), 'delete: confirming removes it');
    // ===== keys =====
    await click('#tab-keys'); await sleep(200);
    ok(await has('the only security key'), 'the only key cannot be removed');
    await fill('#kName', 'hk-bag'); await click('#addKey');
    ok(await until(`document.body.innerText.includes('hk-bag')`), 'a second key is added (needs the box open)');
    await click('#detectBtn'); await sleep(800);
    ok(await until(`document.body.innerText.includes('inserted now')`), 'Detect shows which key is inserted');
    await run(`[...document.querySelectorAll('button')].filter((b) => b.textContent === 'Remove')[0].click()`); await sleep(150);
    ok((await text()).includes('hk-home') && (await text()).includes('hk-bag'), 'removing a key asks first');
    await btn('Yes, remove'); await sleep(500);
    ok(await run("lib.get('paolo').then((r) => r.box.keys.map((k) => k.name).join())") === 'hk-bag', 'removing a key removes exactly that key');
    await fill('#kName', 'hk-home'); await click('#addKey'); await until(`document.body.innerText.includes('hk-home')`);
    // ===== lock, reload, unlock again =====
    await click('#lockBtn'); await sleep(200); await click('#tab-items'); await sleep(200);
    ok(await has('This box is locked') && !(await has('Google')), 'locked: nothing readable');
    await open('#/box/paolo');
    ok(await has('This box is locked'), 'the library survives a reload; the box is locked again');
    await click('#unlockBtn');
    ok(await until(`document.body.innerText.includes('Google')`), 'Unlock with a key shows the items again');
    // ===== a key that never answers must not freeze the app =====
    await send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId: key1.authenticatorId, enabled: false });
    await click('#tab-keys'); await sleep(200); await click('#detectBtn'); await sleep(400);
    await click('#tab-items'); await sleep(200);
    await fill('#iName', 'While waiting'); await fill('#iUrl', 'https://example.com'); await fill('#iSecret', 'w'); await click('#addItem'); await sleep(600);
    ok(await has('While waiting'), 'while a key request is pending, other buttons still work');
    await click('#tab-keys'); await sleep(200); await click('#detectBtn'); await sleep(300);
    ok(await has('Still waiting') || await has('Still working'), 'pressing Detect again says it is still waiting instead of doing nothing');
    await send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId: key1.authenticatorId, enabled: true });
    await run(`document.querySelector('#lockBtn') && void 0`); await open('#/box/paolo'); await click('#unlockBtn'); await until(`!!${q('#lockBtn')}`);
    // ===== naming a key: recognised, already in the box, or new =====
    await open('#/'); await click('#newBtn'); await sleep(250);
    ok(await run(`!!${q('#newKeyFind')}`) && await has('Keys you have used'), 'New box: once the browser knows keys, it offers their names and a way to recognise the plugged-in one');
    await click('#newKeyFind'); await until(`/^hk-/.test(${q('#newKey')}.value)`);   // the one virtual key holds several credentials and answers with any of them
    ok(/This is "hk-(home|bag)"/.test(await text()), 'a key used before is recognised by a touch and its name is filled in');
    await open('#/box/paolo'); await click('#unlockBtn'); await until(`!!${q('#lockBtn')}`); await click('#tab-keys'); await sleep(250);
    const nKeys = () => run(`lib.get('paolo').then((r) => r.box.keys.length)`); const before = await nKeys();
    await click('#kNameFind'); await until(`document.body.innerText.includes('already in this box')`);
    ok(/"hk-(home|bag)" is already in this box/.test(await text()), 'a key that is already in the box is recognised as such');
    await click('#addKey'); await sleep(600);
    ok((await nKeys()) === before && await has('already in this box'), 'it cannot be added twice');
    await send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId: key1.authenticatorId, enabled: false });
    const keyN = await auth();
    await click('#kNameFind'); await until(`document.body.innerText.includes('not a key you have used before')`);
    ok(await has('not a key you have used before') && (await run(`${q('#kName')}.value`)) === '', 'a key no box lists is reported as new, to be named by you');
    await fill('#kName', 'hk-new'); await click('#addKey'); await until(`document.body.innerText.includes('hk-new')`);
    ok((await nKeys()) === before + 1, 'a new key is added under the name you gave it');
    await send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: keyN.authenticatorId });
    await send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId: key1.authenticatorId, enabled: true });
    // ===== another key cannot open it =====
    await send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: key1.authenticatorId }); const key2 = await auth();
    await open('#/box/paolo'); await click('#unlockBtn'); await sleep(1500);
    ok(await has('This box is locked') && (await has('Cancelled') || await has('went wrong') || await has('cannot do this')), 'a key that is not in the box cannot open it');
    await send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: key2.authenticatorId });
  } finally { /* closed below */ }
  // (the key that opens the box was removed above: put a fresh authenticator that holds the right credentials by redoing the flow below)
  try {
    // ===== GitHub (fake), on a box we can unlock =====
    const key3 = await auth();
    await open('#/box/two');            // not there
    ok(await has('No such box'), 'an unknown box says so');
    await open(); await click('#newBtn'); await fill('#newName', 'two'); await fill('#newKey', 'k1'); await click('#createBox');
    await until(`location.hash === '#/box/two' && !!${q('#lockBtn')}`);
    await fill('#iName', 'Site'); await fill('#iUrl', 'https://example.org'); await fill('#iSecret', 's1'); await click('#addItem'); await sleep(400);
    await click('#tab-sync'); await sleep(200);
    ok(await has('Connect to GitHub') && (await run(`${q('#openGh')}.href`)) === 'https://github.com/settings/personal-access-tokens/new', 'the Sync tab walks through connecting: the token step links to GitHub');
    await fill('#iToken', 'ghp_FAKE'); await click('#addToken'); await sleep(500);
    ok(await has('A token is kept in this box') && !(await has('ghp_FAKE')), 'the GitHub token is kept in the box and never displayed');
    ok(!(await run(`lib.list().then((l) => JSON.stringify(l))`)).includes('ghp_FAKE'), 'the token is not readable in the library either');
    await open('#/settings'); await fill('#repoIn', 'paolino/fido-box'); await click('#saveRepo'); await sleep(200);
    await open('#/box/two'); await click('#unlockBtn'); await until(`!!${q('#lockBtn')}`);
    await click('#tab-sync'); await sleep(200);
    ok(await run(`!${q('#pushBtn')}.disabled`), 'with the token available, Push is enabled');
    await click('#testGh'); await sleep(700);
    ok(/Connected: 0 box/.test(await run(`${q('#connState')}.textContent`)), 'Test the connection reports the boxes on GitHub');
    ok((await run(`[...document.querySelectorAll('#ghLinks a')].map((a) => a.href).join(' ')`)) === 'https://github.com/paolino/fido-box/blob/main/boxes/two.json https://github.com/paolino/fido-box/commits/main/boxes/two.json https://github.com/paolino/fido-box/upload/main/boxes', 'the Sync tab links to the box on GitHub, its history, and the upload page');
    await click('#pushBtn'); await sleep(800);
    const gh = await run('JSON.stringify(window.__gh)'); const g = JSON.parse(gh);
    ok(g.puts.length === 1 && g.puts[0].path === 'boxes/two.json' && g.puts[0].message === 'box rev 3' && g.auth.every((a) => a === 'Bearer ghp_FAKE'), 'Push writes boxes/two.json with one commit, using the token from the box');
    ok(JSON.parse(g.files['boxes/two.json']).rev === 3 && !g.files['boxes/two.json'].includes('ghp_FAKE') && !g.files['boxes/two.json'].includes('example.org'), 'what GitHub gets is the locked file');
    // the fake GitHub starts empty on every page load: seed it with what the library holds, then look at the Boxes view
    const seed = (name, mut) => run(`(async () => { const b = (await lib.get('two')).box; ${mut || ''}; window.__gh.files['boxes/${name}.json'] = JSON.stringify(b); })()`);
    await open('#/box/two'); await click('#unlockBtn'); await until(`!!${q('#lockBtn')}`);       // unlocking makes the token available
    await seed('two'); await open(); await sleep(100);
    await run(`void 0`);
    // (a reload drops the unlocked state, so unlock again, seed, and move without reloading)
    await open('#/box/two'); await click('#unlockBtn'); await until(`!!${q('#lockBtn')}`); await seed('two');
    await run(`location.hash = '#/'`); await sleep(300); await click('#refreshBtn'); await sleep(800);
    ok(await has('in sync'), 'Refresh GitHub: the same box in both places is "in sync"');
    ok((await run(`[...document.querySelectorAll('a.chip')].map((a) => a.href).join(' ')`)).includes('https://github.com/paolino/fido-box/blob/main/boxes/two.json') && (await run(`${q('#ghLine a')}.href`)) === 'https://github.com/paolino/fido-box/tree/main/boxes', 'the Boxes list links each GitHub box to its file, and the repository line to the folder');
    await run(`location.hash = '#/box/two'`); await sleep(300); await fill('#iName', 'Later'); await fill('#iUrl', 'https://example.net'); await fill('#iSecret', 's2'); await click('#addItem'); await sleep(500);
    await run(`location.hash = '#/'`); await sleep(300);
    ok(await has('ahead of GitHub'), 'a local change makes it "ahead of GitHub"');
    // someone saved a newer version on GitHub: Push is refused and nothing is written
    await seed('two', 'b.rev = 9');
    await run(`location.hash = '#/box/two'`); await sleep(300); await click('#tab-sync'); await sleep(200);
    const putsBefore = await run('window.__gh.puts.length'); await click('#pushBtn'); await sleep(800);
    ok(await has('newer version (rev 9)') && (await run('window.__gh.puts.length')) === putsBefore, 'Push never overwrites a newer GitHub version');
    // Pull replaces the local copy
    await click('#pullBtn'); await sleep(300); await click('#pullBtn'); await sleep(600);
    ok((await run(`lib.get('two').then((r) => r.box.rev)`)) === 9, 'Pull brings the GitHub version in (asks first when the local one is newer)');
    // a box that exists only on GitHub
    await seed('three'); await run(`location.hash = '#/'`); await sleep(300); await click('#refreshBtn'); await sleep(800);
    ok(await has('three') && await has('only on GitHub'), 'a box only on GitHub is listed as such');
    await run(`location.hash = '#/box/three'`); await sleep(300);
    ok(await has('only on GitHub'), 'opening it says to pull it first');
    await click('#tab-sync'); await sleep(200); await click('#pullBtn'); await sleep(600);
    ok(!!(await run(`lib.get('three')`)), 'Pull copies a GitHub-only box into this browser');
    // import a file
    const file = path.join(profile, 'imp.json'); fs.writeFileSync(file, JSON.stringify(await run(`lib.get('two').then((r) => r.box)`)));
    const setFile = async (f) => { const doc = await send('DOM.getDocument'); const el = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#importFile' }); await send('DOM.setFileInputFiles', { files: [f], nodeId: el.nodeId }); };
    await run(`location.hash = '#/'`); await sleep(300); await setFile(file); await sleep(600);
    ok(!!(await run(`lib.get('imp')`)), 'Import file adds the box to the library under the file name');
    await run(`location.hash = '#/'`); await sleep(200); await setFile(path.join(profile, 'imp.json')); await sleep(400);
    ok(await has('already in this browser') || (await run(`lib.list().then((l) => l.filter((b) => b.name === 'imp').length)`)) === 1, 'importing the same name again is refused');
    const bad = path.join(profile, 'bad.json'); fs.writeFileSync(bad, '{"hello":1}'); await run(`${q('#importFile')}.value = ''`); await setFile(bad); await sleep(500);
    ok(await has('not a box'), 'a file that is not a box is refused');
    // download and delete
    await run(`location.hash = '#/box/imp'`); await sleep(300); await click('#tab-sync'); await sleep(200);
    await btn('Delete from this browser'); await sleep(150); ok(!!(await run(`lib.get('imp')`)), 'delete from this browser asks first');
    await btn('Yes, delete from this browser'); await sleep(600);
    ok(!(await run(`lib.get('imp')`)) && !!g.files, 'confirming deletes only the local copy');
    // a key without PRF is reported as unusable for boxes
    await send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: key3.authenticatorId }); const noPrf = await auth({ hasPrf: false });
    await open('#/keys'); await click('#testKey'); await until(`!!${q('#probeResult')}`);
    ok(await has('PRF / hmac-secret): NO'), 'a key without PRF is reported as unable to hold a box key');
    // ===== a name written on the key itself =====
    await send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: noPrf.authenticatorId }); await auth({ hasResidentKey: true });
    await open('#/keys'); await click('#whoBtn'); await until(`!!${q('#whoResult')}`);
    ok(await has('No label found on this key'), 'a key with no label says so');
    await fill('#labelName', 'hk-bag'); await click('#labelBtn'); await until(`document.querySelector('#status').textContent.includes('written on the key')`);
    ok(true, 'writing a label stores it on the key (PIN, touch)');
    await click('#whoBtn'); await until(`document.body.innerText.includes('This key says: "hk-bag"')`);
    ok(await has('This key says: "hk-bag"'), '"Who is this?" reads the label back from the key');
    await open('#/'); await click('#newBtn'); await sleep(250); await click('#newKeyLabel'); await until(`${q('#newKey')}.value === 'hk-bag'`);
    ok((await run(`${q('#newKey')}.value`)) === 'hk-bag', 'the New box form can fill the key name from its label');
  } finally { try { ws.close(); } catch (e) {} proc.kill(); server.close(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }
  ok(pageErrors.length === 0, 'no uncaught page errors' + (pageErrors.length ? ': ' + pageErrors[0] : ''));
  console.log('\n' + (n - fails) + '/' + n + ' passed'); process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error('ERROR', e); process.exit(2); });
