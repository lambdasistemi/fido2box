const { JSDOM } = require('jsdom'); const fs = require('fs'); const path = require('path'); const nodeCrypto = require('node:crypto');
const DIR = path.join(__dirname, '..', 'web'); let n = 0, fails = 0;
const ok = (c, m) => { n++; if (c) console.log('ok  ' + m); else { fails++; console.log('FAIL ' + m); } };
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
// a fake security key: PRF output depends only on the credential id (as the real key's does)
function fakeKey(window) {
  const creds = window.navigator; let copied = [];
  Object.defineProperty(window.navigator, 'credentials', { value: {
    create: async () => { const id = nodeCrypto.randomBytes(40); return { rawId: id.buffer.slice(id.byteOffset, id.byteOffset + 40), getClientExtensionResults: () => ({ prf: { enabled: true } }) }; },
    get: async (o) => { const id = Buffer.from(o.publicKey.allowCredentials[0].id); const prf = nodeCrypto.createHash('sha256').update(id).digest();
      return { getClientExtensionResults: () => ({ prf: { results: { first: prf.buffer.slice(prf.byteOffset, prf.byteOffset + 32) } } }) }; } } });
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async (t) => { copied.push(t); } } });
  return copied;
}
async function page(file, box, query = '') {
  const html = fs.readFileSync(path.join(DIR, file), 'utf8').replace('<script src="box.js"></script>', '<script>' + fs.readFileSync(path.join(DIR, 'box.js'), 'utf8') + '</script>');
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost:8099/box/' + file + query, pretendToBeVisual: true,
    beforeParse(w) { Object.defineProperty(w, 'crypto', { value: nodeCrypto.webcrypto, configurable: true }); w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder; w.btoa = btoa; w.atob = atob;
      w.fetch = async () => box ? { ok: true, json: async () => box } : { ok: false };
      w.__copied = fakeKey(w); w.URL.createObjectURL = () => 'blob:x'; } });
  await tick(80); return dom.window;
}
const click = (w, id) => w.document.getElementById(id).click();
const set = (w, id, v) => { w.document.getElementById(id).value = v; };
(async () => {
  // ===== manager: new box, two items, one key =====
  let w = await page('setup.html', null);
  ok(/Rehearsal on localhost/.test(w.document.getElementById('where').textContent), 'manager shows it is a rehearsal on localhost');
  ok(!w.document.getElementById('itemsBox').hidden, 'new box: items section is open straight away');
  set(w, 'title', '1Password'); set(w, 'url', 'https://my.1password.com/signin'); set(w, 'secret', 'A3-TEST-SECRET'); click(w, 'addItem'); await tick(100);
  set(w, 'title', 'Bad'); set(w, 'url', 'javascript:alert(1)'); set(w, 'secret', 'x'); click(w, 'addItem'); await tick(60);
  ok(/web address/.test(w.document.getElementById('itemMsg').textContent), 'a javascript: address is refused');
  set(w, 'title', 'Google'); set(w, 'url', 'https://accounts.google.com'); set(w, 'secret', 'backup-code-1'); click(w, 'addItem'); await tick(100);
  ok(w.document.querySelectorAll('#list tr').length === 2, 'two items listed');
  ok(w.document.getElementById('outBox').hidden, 'no file offered until a key is added');
  set(w, 'keyName', 'hk-phone'); click(w, 'addKey'); await tick(300);
  ok(!w.document.getElementById('outBox').hidden, 'file offered once a key is added');
  const file = JSON.parse(w.document.getElementById('out').value);
  ok(file.v === 2 && file.keys.length === 1 && file.items.length === 2 && file.rpId === 'localhost', 'file: version 2, one key, two items, rpId localhost');
  ok(!JSON.stringify(file).match(/1Password|Google|A3-TEST|backup-code|accounts\.google/), 'file leaks no title, address or secret');
  click(w, 'verify'); await tick(400);
  ok(/opens: 2 item/.test(w.document.getElementById('verifyMsg').textContent), 'test button: opens with 2 items');
  // ===== unlock page on that file =====
  w = await page('index.html', file);
  ok(!w.document.getElementById('demo').hidden, 'unlock page shows the rehearsal banner on localhost');
  click(w, 'go'); await tick(400);
  ok(!w.document.getElementById('done').hidden, 'Unlock reveals the items');
  const titles = [...w.document.querySelectorAll('#items h3')].map((h) => h.textContent);
  ok(titles.join() === '1Password,Google', 'titles shown: ' + titles.join(', '));
  const links = [...w.document.querySelectorAll('#items a')].map((a) => a.href);
  ok(links[0] === 'https://my.1password.com/signin' && links[1] === 'https://accounts.google.com/', 'Open links go to field 1: ' + links.join(' '));
  ok([...w.document.querySelectorAll('#items a')].every((a) => a.rel.includes('noopener')), 'Open links are noopener');
  [...w.document.querySelectorAll('#items button')][1].click(); await tick(60);
  ok(w.__copied[0] === 'backup-code-1', 'Copy puts field 2 of THAT item on the clipboard');
  ok(!w.document.body.textContent.includes('backup-code-1') && !w.document.body.textContent.includes('A3-TEST'), 'secrets are not shown on the page');
  // ===== Italian =====
  w = await page('index.html', file, '?lang=it'); click(w, 'go'); await tick(400);
  ok(w.document.getElementById('go').textContent === 'Sblocca' && /Copia il segreto/.test(w.document.body.textContent), 'Italian version works');
  // ===== manager on the existing file: unlock, add an item and a second key, delete one =====
  w = await page('setup.html', file);
  ok(!w.document.getElementById('unlock').hidden && w.document.getElementById('itemsBox').hidden, 'existing box: must unlock before managing');
  click(w, 'unlock'); await tick(400);
  ok(w.document.querySelectorAll('#list tr').length === 2, 'unlocking lists the existing 2 items');
  set(w, 'title', 'GitHub'); set(w, 'url', 'https://github.com/login'); set(w, 'secret', 'recovery-codes'); click(w, 'addItem'); await tick(100);
  [...w.document.querySelectorAll('#list button')][0].click(); await tick(100);
  ok(w.document.querySelectorAll('#list tr').length === 3, 'delete: first click only asks, nothing is removed');
  ok(!w.document.getElementById('dirty').hidden, 'edits show the not-saved banner');
  [...w.document.querySelectorAll('#list button')].find((b) => /^Yes/.test(b.textContent)).click(); await tick(100);
  ok(w.document.querySelectorAll('#list tr').length === 2, 'delete: confirming removes it');
  set(w, 'keyName', 'hk-bag'); click(w, 'addKey'); await tick(300);
  const file2 = JSON.parse(w.document.getElementById('out').value);
  ok(file2.keys.length === 2 && file2.items.length === 2, 'after: 2 keys, 2 items (added one, deleted one)');
  w = await page('index.html', file2); click(w, 'go'); await tick(400);
  ok([...w.document.querySelectorAll('#items h3')].map((h) => h.textContent).join() === 'Google,GitHub', 'second file opens with the right items');
  // ===== missing box.json =====
  w = await page('index.html', null); click(w, 'go'); await tick(200);
  ok(/Nothing has been set up/.test(w.document.getElementById('msg').textContent), 'no box.json: friendly message');
  console.log('\n' + (n - fails) + '/' + n + ' passed'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(2); });
