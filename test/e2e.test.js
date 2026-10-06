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
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost:8099/' + file + query, pretendToBeVisual: true,
    beforeParse(w) { Object.defineProperty(w, 'crypto', { value: nodeCrypto.webcrypto, configurable: true }); w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder; w.btoa = btoa; w.atob = atob;
      w.fetch = async () => box ? { ok: true, json: async () => box } : { ok: false };
      w.__copied = fakeKey(w); w.URL.createObjectURL = () => 'blob:x'; } });
  await tick(80); return dom.window;
}
const click = (w, id) => w.document.getElementById(id).click();
const set = (w, id, v) => { w.document.getElementById(id).value = v; };
(async () => {
  const $$ = (w, s) => [...w.document.querySelectorAll(s)];
  // ===== one page: no box yet -> create =====
  let w = await page('index.html', null);
  ok(!w.document.getElementById('demo').hidden, 'rehearsal banner on localhost');
  click(w, 'go'); await tick(200);
  ok(/no box here yet/i.test(w.document.getElementById('msg').textContent) && !w.document.getElementById('create').hidden, 'no box.json: friendly message and a Create button');
  click(w, 'create'); await tick(100);
  ok(!w.document.getElementById('manage').hidden, 'creating opens the editor');
  set(w, 'name', '1Password'); set(w, 'url', 'https://my.1password.com/signin'); set(w, 'secret', 'A3-TEST-SECRET'); click(w, 'addItem'); await tick(100);
  set(w, 'name', 'Bad'); set(w, 'url', 'javascript:alert(1)'); set(w, 'secret', 'x'); click(w, 'addItem'); await tick(60);
  ok(/web address/.test(w.document.getElementById('itemMsg').textContent), 'a javascript: address is refused');
  set(w, 'name', 'Google'); set(w, 'url', 'https://accounts.google.com'); set(w, 'secret', 'backup-code-1'); click(w, 'addItem'); await tick(100);
  ok($$(w, '#list tr').length === 2, 'two items listed');
  ok(w.document.getElementById('outBox').hidden, 'no file offered until a key is added');
  set(w, 'keyName', 'hk-phone'); click(w, 'addKey'); await tick(300);
  ok(!w.document.getElementById('outBox').hidden, 'file offered once a key is added');
  const file = JSON.parse(w.document.getElementById('out').value);
  ok(file.v === 2 && file.keys.length === 1 && file.items.length === 2 && file.rpId === 'localhost', 'file: version 2, one key, two items, rpId localhost');
  ok(!JSON.stringify(file).match(/1Password|Google|A3-TEST|backup-code|accounts\.google/), 'file leaks no title, address or secret');
  ok(!w.document.getElementById('dirty').hidden, 'edits show the not-saved banner');
  click(w, 'verify'); await tick(400);
  ok(/opens: 2 thing/.test(w.document.getElementById('verifyMsg').textContent), 'check button: opens with 2 things');
  // ===== same page, existing box: unlock, use =====
  w = await page('index.html', file);
  ok(w.document.getElementById('manage').hidden && w.document.getElementById('done').hidden, 'existing box: nothing shown before unlocking');
  click(w, 'go'); await tick(400);
  ok(!w.document.getElementById('done').hidden, 'Unlock reveals the items');
  ok(w.document.getElementById('manage').hidden, 'editor stays closed until asked');
  ok($$(w, '#items h3').map((h) => h.textContent).join() === '1Password,Google', 'titles shown');
  const links = $$(w, '#items a').map((a) => a.href);
  ok(links[0] === 'https://my.1password.com/signin' && links[1] === 'https://accounts.google.com/', 'Open links go to the address: ' + links.join(' '));
  ok($$(w, '#items a').every((a) => a.rel.includes('noopener')), 'Open links are noopener');
  $$(w, '#items button')[1].click(); await tick(60);
  ok(w.__copied[0] === 'backup-code-1', 'Copy puts the secret of THAT item on the clipboard');
  ok(!w.document.body.textContent.includes('backup-code-1') && !w.document.body.textContent.includes('A3-TEST'), 'secrets are not shown on the page');
  // ===== edit the same session: add item, delete with confirmation, add key =====
  click(w, 'edit'); await tick(60);
  ok(!w.document.getElementById('manage').hidden && $$(w, '#list tr').length === 2, 'Edit opens the editor with the 2 items');
  set(w, 'name', 'GitHub'); set(w, 'url', 'https://github.com/login'); set(w, 'secret', 'recovery-codes'); click(w, 'addItem'); await tick(100);
  $$(w, '#list button')[0].click(); await tick(100);
  ok($$(w, '#list tr').length === 3, 'delete: first click only asks, nothing is removed');
  $$(w, '#list button').find((b) => /^Yes/.test(b.textContent)).click(); await tick(100);
  ok($$(w, '#list tr').length === 2, 'delete: confirming removes it');
  ok($$(w, '#keys button').length === 0, 'the only key cannot be removed');
  set(w, 'keyName', 'hk-bag'); click(w, 'addKey'); await tick(300);
  const file2 = JSON.parse(w.document.getElementById('out').value);
  ok(file2.keys.length === 2 && file2.items.length === 2, 'after: 2 keys, 2 items (added one, deleted one)');
  ok($$(w, '#items h3').map((h) => h.textContent).join() === 'Google,GitHub', 'the list above follows the edits');
  w = await page('index.html', file2); click(w, 'go'); await tick(400);
  ok($$(w, '#items h3').map((h) => h.textContent).join() === 'Google,GitHub', 'second file opens with the right items');
  // ===== Italian =====
  w = await page('index.html', file, '?lang=it'); click(w, 'go'); await tick(400);
  ok(w.document.getElementById('title').textContent === 'Recupera i tuoi segreti' && /Copia il segreto/.test(w.document.body.textContent), 'Italian version works');
  console.log('\n' + (n - fails) + '/' + n + ' passed'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(2); });
