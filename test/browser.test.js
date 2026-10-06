// Real Chrome, real WebAuthn (Chrome's virtual security key with PRF), the real page served over http://localhost.
// Run: node test/browser.test.js   (needs google-chrome / chromium on PATH; skipped when missing)
const { spawn, spawnSync } = require('child_process'); const http = require('http'); const fs = require('fs'); const os = require('os'); const path = require('path');
const chrome = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].find((c) => spawnSync('sh', ['-c', 'command -v ' + c]).status === 0);
if (!chrome) { console.log('skipped: no chrome on PATH'); process.exit(0); }
const WEB = path.join(__dirname, '..', 'web'); let n = 0, fails = 0;
const ok = (c, m) => { n++; if (c) console.log('ok  ' + m); else { fails++; console.log('FAIL ' + m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let served = {};   // extra files (box.json ...) the test serves next to the page
const server = http.createServer((q, r) => {
  const p = decodeURIComponent(q.url.split('?')[0]).replace(/^\//, '') || 'index.html';
  if (served[p] !== undefined) { r.writeHead(200, { 'content-type': 'application/json' }); return r.end(served[p]); }
  fs.readFile(path.join(WEB, p), (e, d) => { if (e) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript' }[path.extname(p)] || 'text/plain' }); r.end(d); });
});
async function main() {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const base = 'http://localhost:' + server.address().port + '/';
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'box-chrome-'));
  const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((res, rej) => { let b = ''; proc.stderr.on('data', (d) => { b += d; const m = b.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); }); setTimeout(() => rej(new Error('chrome did not start')), 20000); });
  const port = new URL(wsUrl).port;
  const target = await (await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = {}; const events = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending[d.id]) { pending[d.id](d); delete pending[d.id]; } else events.push(d); };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending[i] = (d) => (d.error ? rej(new Error(method + ': ' + d.error.message)) : res(d.result)); ws.send(JSON.stringify({ id: i, method, params })); });
  const run = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result.value; };
  const open = async (url) => { await send('Page.navigate', { url }); await sleep(600); };
  const click = (sel) => run(`document.querySelector(${JSON.stringify(sel)}).click()`);
  const fill = (sel, v) => run(`document.querySelector(${JSON.stringify(sel)}).value = ${JSON.stringify(v)}`);
  const text = (sel) => run(`document.querySelector(${JSON.stringify(sel)}).textContent`);
  const until = async (expr, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await run(expr).catch(() => false)) return true; await sleep(150); } return false; };
  try {
    await send('Page.enable'); await send('Runtime.enable'); await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true }); await send('WebAuthn.enable', { enableUI: false });
    await send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: base.replace(/\/$/, '') }).catch(() => {});
    const key = await send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'usb', hasResidentKey: false, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true } });
    // ===== make a box in the page =====
    await open(base);
    ok(await run(`typeof RP === 'string' && RP === 'localhost'`), 'page loads; rpId is localhost');
    await click('#newBtn');
    await fill('#name', '1Password'); await fill('#url', 'https://my.1password.com/signin'); await fill('#secret', 'A3-REAL-CHROME-SECRET'); await click('#addItem');
    await fill('#keyName', 'virtual-key'); await click('#addKey');
    ok(await until(`!document.querySelector('#outBox').hidden`), 'add a key with the real browser WebAuthn + PRF: file offered');
    ok(/Added/.test(await text('#keyMsg')), 'key message says added: ' + (await text('#keyMsg')));
    const file = await run(`document.querySelector('#out').value`);
    const box = JSON.parse(file);
    ok(box.v === 2 && box.rev === 1 && box.keys.length === 1 && box.items.length === 1 && box.rpId === 'localhost', 'file: v2, rev 1, one key, one item');
    ok(!file.includes('1Password') && !file.includes('A3-REAL') && !file.includes('my.1password'), 'file leaks no title, address or secret');
    await click('#verify');
    ok(await until(`/opens: 1 thing/.test(document.querySelector('#verifyMsg').textContent)`), 'the check button unlocks the new file: ' + (await text('#verifyMsg')));
    // ===== unlock it on a fresh page =====
    served['box.json'] = file;
    await open(base);
    ok(await run(`document.querySelector('#chosen').textContent.includes('box.json')`), 'a box.json next to the page is chosen automatically');
    await click('#go');
    ok(await until(`!document.querySelector('#done').hidden`), 'Unlock with the key shows the items: ' + (await text('#msg')));
    ok((await text('#items h3')) === '1Password', 'title shown');
    ok((await run(`document.querySelector('#items a').href`)) === 'https://my.1password.com/signin', 'Open goes to the address');
    ok(!(await run(`document.body.textContent`)).includes('A3-REAL'), 'the secret is not shown');
    await run("window.__werr = null; const w = navigator.clipboard.writeText.bind(navigator.clipboard); navigator.clipboard.writeText = (t) => w(t).catch((e) => { window.__werr = e.name + ': ' + e.message; throw e; })");
    await click('#items button'); await sleep(300);
    const werr = await run('window.__werr'); if (werr) console.log('writeText error: ' + werr);
    const clip = await run(`navigator.clipboard.readText()`).catch((e) => 'ERR ' + e.message);
    ok(clip === 'A3-REAL-CHROME-SECRET', 'Copy puts the secret on the real clipboard' + (clip === 'A3-REAL-CHROME-SECRET' ? '' : ' (got: ' + String(clip).slice(0, 40) + ')'));
    // ===== a key that is not in the box cannot open it =====
    await send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: key.authenticatorId });
    await send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'usb', hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true } });
    await open(base); await click('#go'); await sleep(1500);
    ok(await run(`document.querySelector('#done').hidden`), 'another key cannot open the box: ' + (await text('#msg')).slice(0, 80));
  } finally { try { ws.close(); } catch (e) {} proc.kill(); server.close(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }
  console.log('\n' + (n - fails) + '/' + n + ' passed'); process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error('ERROR', e); process.exit(2); });
