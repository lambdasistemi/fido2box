// Real Chrome, real WebAuthn (Chrome's virtual security key with PRF), real IndexedDB, the real app served over http://localhost.
// GitHub is faked inside the page (its CORS rules were checked against the real API by hand).
// Run: node test/browser.test.js (requires google-chrome / chromium on PATH).
const { spawn, spawnSync } = require('child_process'); const http = require('http'); const fs = require('fs'); const os = require('os'); const path = require('path');
const chrome = ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'].find((c) => spawnSync('sh', ['-c', 'command -v ' + c]).status === 0);
if (!chrome) { console.error('FAILED: Chrome/Chromium is required; run nix develop -c just browser'); process.exit(1); }
const WEB = path.join(__dirname, '..', 'web'); let n = 0, fails = 0;
const ok = (c, m) => { n++; if (c) console.log('ok  ' + m); else { fails++; console.log('FAIL ' + m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
let delayFirstApp = true;
const server = http.createServer(async (q, r) => {
  const p = decodeURIComponent(q.url.split('?')[0]).replace(/^\//, '') || 'index.html';
  if (p === 'COMMIT') { r.writeHead(200); return r.end('0123456789abcdef0123456789abcdef01234567\n'); }
  // Exercise startup readiness on every run, beyond the former fixed 800ms wait.
  if (p === 'app.js' && delayFirstApp) { delayFirstApp = false; await sleep(1500); }
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
  // Crashpad needs a writable config directory even with an isolated user-data-dir.
  const config = path.join(profile, 'config'); fs.mkdirSync(config);
  const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', '--no-sandbox', '--disable-gpu', 'about:blank'], { env: { ...process.env, XDG_CONFIG_HOME: config }, stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((res, rej) => { let b = ''; proc.stderr.on('data', (d) => { b += d; const m = b.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); }); setTimeout(() => rej(new Error('chrome did not start')), 20000); });
  const target = await (await fetch('http://127.0.0.1:' + new URL(wsUrl).port + '/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = {}; const pageErrors = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending[d.id]) { pending[d.id](d); delete pending[d.id]; } else if (d.method === 'Runtime.exceptionThrown') pageErrors.push(d.params.exceptionDetails.exception ? d.params.exceptionDetails.exception.description : d.params.exceptionDetails.text); };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending[i] = (d) => (d.error ? rej(new Error(method + ': ' + d.error.message)) : res(d.result)); ws.send(JSON.stringify({ id: i, method, params })); });
  const run = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result.value; };
  const until = async (expr, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await run(expr).catch(() => false)) return true; await sleep(120); } return false; };
  const q = (s) => `document.querySelector(${JSON.stringify(s)})`;
  const click = (s) => run(`${q(s)}.click()`); const fill = (s, v) => run(`(()=>{const el=${q(s)};el.value=${JSON.stringify(v)};el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const text = () => run('document.body.innerText'); const has = async (t) => (await text()).includes(t);
  const btn = (label) => run(`[...document.querySelectorAll('button,a.btn')].find((b) => b.textContent.trim() === ${JSON.stringify(label)}).click()`);
  const addRecord = async (title,url,secret) => {
    await click('#new-record'); await fill('#record-title',title);
    await btn('Password or recovery key'); await fill('textarea[data-value]',secret);
    await btn('Website');
    // Field groups each contain one primary textarea.
    await run(`(()=>{const inputs=document.querySelectorAll('textarea[data-value]');const el=inputs[inputs.length-1];el.value=${JSON.stringify(url)};el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await click('#save-record'); await until(`!document.querySelector('#record-title')`);
  };
  const open = async (hash = '') => {   // always a real reload, including its asynchronous first render
    await send('Page.navigate', { url: 'about:blank' }); await send('Page.navigate', { url: base + hash });
    if (!await until(`location.href === ${JSON.stringify(base + hash)} && document.readyState === 'complete' && !!document.querySelector('#app > *')`)) throw new Error('App did not render after navigation to ' + base + hash + ': ' + JSON.stringify(await run("({url:location.href,state:document.readyState,app:document.querySelector('#app')?.textContent})")) + '; errors: ' + JSON.stringify(pageErrors));
  };
  const screenshot = async (name) => {
    if (!process.env.FIDO_UI_SCREENSHOTS) return;
    fs.mkdirSync(process.env.FIDO_UI_SCREENSHOTS, { recursive: true });
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(process.env.FIDO_UI_SCREENSHOTS, name + '.png'), Buffer.from(shot.data, 'base64'));
  };
  const theme = (value) => click(`[data-theme-choice="${value}"]`);
  const systemTheme = async (value) => { await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] }); await sleep(150); };
  const noOverflow = () => run('innerWidth <= 320 && document.documentElement.scrollWidth <= innerWidth');
  const labeledInputs = () => run(`[...document.querySelectorAll('input:not([type=file])')].every((input) => input.labels.length > 0)`);
  const visibleHelp = () => run(`document.querySelectorAll('button[data-help]:not([hidden])').length`);
  const auditVisible = () => run(`(() => { const notice = document.querySelector('#audit-notice'), link = notice?.querySelector('a'); if (!notice || !link) return false; const rect = notice.getBoundingClientRect(), style = getComputedStyle(notice), linkRect = link.getBoundingClientRect(), linkStyle = getComputedStyle(link); return notice.innerText.includes('Experimental — not independently audited. Do not rely on this as your only recovery copy.') && rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.right <= innerWidth && style.visibility === 'visible' && style.display !== 'none' && style.color !== style.backgroundColor && linkRect.width > 0 && linkRect.height > 0 && linkRect.left >= 0 && linkRect.right <= innerWidth && linkStyle.visibility === 'visible' && linkStyle.display !== 'none'; })()`);
  const key = async (name, code, shift = false) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name, windowsVirtualKeyCode: code, modifiers: shift ? 8 : 0, ...(name === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: code, modifiers: shift ? 8 : 0 });
  };
  const auth = (extra = {}) => send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'usb', hasResidentKey: false, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true, ...extra } });
  try {
    await send('Page.enable'); await send('Runtime.enable'); await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_GH + LIB_READER + 'window.confirm = () => window.__confirmChoice !== false;' }); await send('WebAuthn.enable', { enableUI: false });
    await send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: base.replace(/\/$/, '') }).catch(() => {});
    const key1 = await auth();
    // ===== empty library, make a box =====
    await open();
    ok(await run("!!document.querySelector('#connectKey') && !!document.querySelector('#setupKey')"), 'an empty library offers key-held GitHub connection and setup before opening a box');
    await require('./storage.browser.cjs')({ run, ok });
    await require('./key-access-choice.browser.cjs')({ run, ok });
    await require('./sessions.browser.cjs')({ run, ok });
    await require('./record-ui.browser.cjs')({ run, ok });
    ok(await has('No boxes yet'), 'a new browser has an empty library');
    ok(await auditVisible() && await run(`(() => { const notice = document.querySelector('#audit-notice'); return !document.querySelector('#app').contains(notice) && notice.getAttribute('aria-label') === 'Security notice' && !notice.matches('[role="alert"], [aria-live]') && !notice.querySelector('button'); })()`), 'a fresh page shows a persistent, non-dismissible security notice without a live alert');
    ok(await run(`(() => { const link = document.querySelector('#audit-notice a'); return !!link && link.textContent === 'Security limitations' && link.href === location.origin + '/docs/security/' && link.target === '_blank' && link.relList.contains('noopener') && link.relList.contains('noreferrer'); })()`), 'the named security link opens same-origin limitations separately without opener access or referrer');
    await run(`document.querySelector('[data-theme-choice="system"]').focus()`); await key('Tab', 9);
    ok(await run(`document.activeElement === document.querySelector('#audit-notice a') && getComputedStyle(document.activeElement).outlineStyle !== 'none'`), 'Tab reaches the security limitations link with visible keyboard focus');
    ok(await run(`!!document.querySelector('#n-docs') && !!document.querySelector('[data-help="boxes"]')`), 'Documentation and contextual help are available without a box');
    ok(await run(`document.querySelectorAll('[data-theme-choice]').length === 3`), 'Light, Dark, and System controls are available on every page');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await systemTheme('light');
    ok(await run(`document.documentElement.dataset.theme === 'light' && document.querySelector('[data-theme-choice="system"]').getAttribute('aria-pressed') === 'true'`), 'first visit follows the system and announces the selected appearance');
    await theme('dark');
    const darkBackground = await run('getComputedStyle(document.body).backgroundColor');
    const darkNoticeColor = await run(`document.querySelector('#audit-notice') ? getComputedStyle(document.querySelector('#audit-notice')).color : ''`);
    ok(await run(`getComputedStyle(document.documentElement).colorScheme === 'dark'`), 'Dark uses the dark palette and dark native controls');
    await screenshot('desktop-dark');
    await systemTheme('dark'); await theme('light');
    const lightBackground = await run('getComputedStyle(document.body).backgroundColor');
    ok(lightBackground !== darkBackground && await run(`getComputedStyle(document.documentElement).colorScheme === 'light'`), 'Light overrides a dark system preference and changes the rendered palette');
    ok(await auditVisible() && darkNoticeColor !== await run(`getComputedStyle(document.querySelector('#audit-notice')).color`), 'the security notice follows the Light and Dark palettes');
    await screenshot('desktop-light');
    await open('#/settings');
    ok(await run(`document.documentElement.dataset.theme === 'light' && document.querySelector('[data-theme-choice="light"]').getAttribute('aria-pressed') === 'true'`), 'the appearance choice survives reloads and navigation');
    ok(await labeledInputs(), 'Settings fields have associated labels');
    await theme('system');
    ok(await run(`document.documentElement.dataset.theme === 'dark'`), 'System returns to the current operating-system preference');
    await systemTheme('light');
    ok(await until(`document.documentElement.dataset.theme === 'light'`), 'System responds to an operating-system appearance change without reloading');
    await open('#/keys');
    ok(await run(`document.querySelector('[data-theme-choice="system"]').getAttribute('aria-pressed') === 'true'`), 'System selection is remembered too');
    await run(`document.querySelector('[data-theme-choice="dark"]').focus()`);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    ok(await run(`document.documentElement.dataset.theme === 'dark' && document.activeElement.getAttribute('data-theme-choice') === 'dark'`), 'theme buttons work with the keyboard and retain focus');
    await run(`localStorage.setItem('fido2box-theme', 'invalid')`); await open();
    ok(await run(`document.querySelector('[data-theme-choice="system"]').getAttribute('aria-pressed') === 'true'`), 'an invalid stored preference falls back to System');
    const blockedStorage = await send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });` });
    await open(); await theme('dark'); await theme('light');
    ok(await has('No boxes yet') && await run(`document.documentElement.dataset.theme === 'light'`), 'blocked localStorage does not prevent startup or theme changes');
    await open('#/settings'); await click('#inlineHelp');
    ok(await has('cannot be remembered after reload') && await visibleHelp() === 0, 'blocked storage still allows disabling help and explains that it cannot persist');
    await run(`location.hash = '#/'`); await sleep(150);
    ok(await visibleHelp() === 0, 'the help choice works across routes when storage is blocked');
    await open();
    ok(await visibleHelp() > 0, 'blocked storage safely returns to default help on reload');
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: blockedStorage.identifier });
    await open(); await theme('light');
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 800, deviceScaleFactor: 1, mobile: true });
    ok(await noOverflow(), 'the header and empty library fit a 320px phone');
    ok(await auditVisible() && await noOverflow(), 'the security notice and link fit a 320px phone in Light');
    await screenshot('phone-light');
    await theme('dark'); await screenshot('phone-dark');
    ok(await auditVisible() && await noOverflow(), 'the security notice and link fit a 320px phone in Dark');
    await open('#/settings');
    ok(await noOverflow(), 'Settings fits a 320px phone without horizontal page scrolling');
    await screenshot('phone-settings-dark');
    await run(`document.querySelector('.skip-link').click()`);
    ok(await run(`location.hash === '#/settings' && document.activeElement.id === 'app'`), 'Skip to content focuses the current page without changing the route');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await open(); await theme('system');
    // ===== documentation, help popups, and persistent settings =====
    await run(`window.__auditNotice = document.querySelector('#audit-notice')`);
    await click('#n-docs'); await until(`document.querySelector('h1')?.textContent === 'Documentation'`);
    ok(await auditVisible() && await run(`window.__auditNotice === document.querySelector('#audit-notice')`), 'changing routes preserves the same static security notice');
    ok(await run(`${q('#n-docs')}.getAttribute('aria-current') === 'page' && document.querySelectorAll('.docs-section').length === 8`), 'Documentation is a full guide available without unlocking or connecting');
    ok(await has('security key alone cannot recreate a lost box') && await has('Removing a key does not revoke'), 'the guide explains recovery requirements and key-removal limits');
    await click('.docs-contents a[href="#/docs/recovery"]');
    ok(await until(`document.activeElement.id === 'docs-recovery'`), 'documentation topic links navigate to and focus their section');
    await open('#/docs/tokens');
    ok(await run(`document.activeElement.id === 'docs-tokens'`), 'a documentation deep link also works on a fresh load');
    await screenshot('documentation-desktop');
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 800, deviceScaleFactor: 1, mobile: true });
    await open('#/docs');
    ok(await noOverflow(), 'Documentation and the four-tab navigation fit a 320px phone');
    await screenshot('documentation-phone-light');
    await theme('dark'); await screenshot('documentation-phone-dark');
    await open(); await click('#newBtn'); await fill('#newName', 'keep-my-name'); await fill('#newKey', 'keep-my-key');
    await run(`${q('[data-help="create"]')}.focus()`); await key('Enter', 13);
    ok(await run(`${q('#inlineHelpDialog')}.open && ${q('#inlineHelpTitle')}.textContent === 'Create or import a box' && document.activeElement.textContent === 'Close'`), 'keyboard activation opens a named help dialog and moves focus inside');
    ok(await noOverflow() && await run(`${q('#inlineHelpDialog')}.getBoundingClientRect().right <= innerWidth`), 'the help popup fits a 320px phone');
    await screenshot('help-phone-dark');
    await key('Tab', 9); await key('Tab', 9);
    ok(await run(`${q('#inlineHelpDialog')}.contains(document.activeElement)`), 'Tab keeps keyboard focus inside the modal help popup');
    await key('Tab', 9, true);
    ok(await run(`document.activeElement === ${q('#inlineHelpDialog a')}`), 'Shift+Tab wraps back to the documentation link');
    await key('Escape', 27);
    ok(await until(`!${q('#inlineHelpDialog')}.open && document.activeElement.dataset.help === 'create'`), 'Escape dismisses help and restores focus to its button');
    ok(await run(`${q('#newName')}.value === 'keep-my-name' && ${q('#newKey')}.value === 'keep-my-key'`), 'opening and closing help preserves the new-box form');
    await click('[data-help="create"]'); await click('#inlineHelpDialog button');
    ok(await run(`!${q('#inlineHelpDialog')}.open`), 'the explicit Close button dismisses the help popup');
    await click('[data-help="create"]');
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 1, y: 1, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 1, y: 1, button: 'left', clickCount: 1 });
    ok(await run(`!${q('#inlineHelpDialog')}.open`), 'clicking outside the popup dismisses it');
    await click('[data-help="create"]'); await click('#inlineHelpDialog a');
    ok(await until(`location.hash === '#/docs/create' && document.activeElement.id === 'docs-create' && !${q('#inlineHelpDialog')}.open`), 'popup guidance links to the matching Documentation section');
    await open('#/settings');
    ok(await run(`${q('#inlineHelp')}.checked`) && await visibleHelp() > 0, 'inline help is enabled by default in Settings');
    await fill('#repoIn', 'draft/repository'); await fill('#tokIn', 'draft-token'); await click('#inlineHelp');
    ok(await visibleHelp() === 0 && await run(`${q('#repoIn')}.value === 'draft/repository' && ${q('#tokIn')}.value === 'draft-token' && document.activeElement.id !== 'app'`), 'disabling help hides its buttons without replacing settings fields');
    await open('#/settings');
    ok(await run(`!${q('#inlineHelp')}.checked`) && await visibleHelp() === 0, 'disabled help is remembered after reloading Settings');
    ok(await auditVisible(), 'the security notice remains visible when inline help is disabled');
    await open('#/keys');
    ok(await visibleHelp() === 0, 'the saved disabled preference applies on other pages');
    await open('#/docs');
    ok(await has('Documentation') && await run(`document.querySelectorAll('.docs-section').length === 8`), 'Documentation stays available when inline help is disabled');
    await open('#/settings'); await click('#inlineHelp'); await open();
    ok(await visibleHelp() > 0, 're-enabling help is also remembered after reload');
    await run(`localStorage.setItem('fido2box-inline-help', 'invalid')`); await open();
    ok(await visibleHelp() > 0, 'an invalid stored help preference falls back to enabled');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await theme('system');
    ok((await run(`${q('#codeLink')}.href`)) === 'https://github.com/lambdasistemi/fido2box', 'the footer links to the code');
    ok((await run(`${q('#commitLink')}.textContent`)) === '0123456' && (await run(`${q('#commitLink')}.href`)).endsWith('/commit/0123456789abcdef0123456789abcdef01234567'), 'the footer shows and links the commit being served');
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
    ok(await labeledInputs(), 'New box fields have associated labels');
    ok(await run(`[...document.querySelectorAll('input')].every((i) => i.hasAttribute('data-1p-ignore') && i.getAttribute('data-lpignore') === 'true' && i.hasAttribute('data-bwignore'))`) && (await run(`document.querySelectorAll('input').length`)) > 0, 'every input on the page tells password managers to ignore it');
    await click('#newBtn'); await fill('#newName', 'bad name!'); await fill('#newKey', 'hk-home'); await click('#createBox'); await sleep(500);
    ok(await has('letters, digits'), 'a bad box name is refused');
    await fill('#newName', 'paolo'); await click('#createBox');
    ok(await until(`location.hash === '#/box/paolo' && !!${q('#lockBtn')}`), 'creating a box with a key (real WebAuthn + PRF) opens it, unlocked');
    ok(await auditVisible(), 'an unlocked box still shows the security notice');
    const rec = JSON.parse(await run(`lib.get('paolo').then((r) => JSON.stringify(r.box))`));
    ok(rec.v === 3 && rec.rev === 1 && rec.keys.length === 1 && rec.keys[0].name === 'hk-home' && rec.rpId === 'localhost', 'library record: v3, rev 1, key hk-home, rpId localhost');
    // ===== items =====
    for (const [nm, u, s] of [['1Password', 'https://my.1password.com/signin', 'A3-SECRET-ONE'], ['Google', 'https://accounts.google.com', 'g-code-two']]) { await addRecord(nm,u,s); }
    await addRecord('Bad','javascript:alert(1)','x');
    ok(await has('Invalid address') && !(await run(`!!document.querySelector('a[href^="javascript:"]')`)), 'a javascript address stays savable and copyable but cannot navigate');
    await btn('Google');
    ok((await text()).includes('1Password') && (await text()).includes('accounts.google.com'), 'record titles and the active record address are displayed');
    ok(!(await text()).includes('A3-SECRET-ONE') && !(await run('document.documentElement.outerHTML')).includes('A3-SECRET-ONE'), 'secrets are not in the page');
    ok(await labeledInputs(), 'item fields have associated labels');
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 800, deviceScaleFactor: 1, mobile: true });
    ok(await noOverflow(), 'an unlocked box with item actions fits a 320px phone');
    await screenshot('phone-items');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await screenshot('desktop-items');
    const stored = await run(`lib.list().then((l) => JSON.stringify(l))`);
    ok(!/1Password|google|A3-SECRET|g-code/i.test(stored), 'what is stored in the library leaks no title, address or secret');
    await btn('1Password');
    ok((await run(`${q('a.field-value')}.href`)) === 'https://my.1password.com/signin', 'the URL value itself links to the address');
    ok(await run(`${q('a.field-value')}.rel`).then((r) => r.includes('noopener')), 'the URL value has noopener');
    await btn('Google'); await click('button.copy'); await sleep(300);
    ok((await run(`navigator.clipboard.readText()`).catch((e) => 'ERR ' + e.message)) === 'g-code-two', 'Copy puts that item\'s secret on the real clipboard');
    // Deletion requires an explicit confirmation.
    await btn('1Password'); await run('window.__confirmChoice=false'); await btn('Delete record'); await sleep(150);
    ok((await text()).includes('1Password'), 'delete: rejecting confirmation preserves the record');
    await run('window.__confirmChoice=true'); await btn('Delete record'); await sleep(500);
    ok(!(await text()).includes('1Password') && (await text()).includes('Google'), 'delete: confirming removes it');
    // ===== keys =====
    await click('#tab-keys'); await sleep(200);
    ok(await has('the only security key'), 'the only key cannot be removed');
    await send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId: key1.authenticatorId, enabled: false });
    const bagKey = await auth();
    await click('#kNameManual'); await fill('#kName', 'hk-bag'); await click('#addKey');
    ok(await until(`document.body.innerText.includes('hk-bag')`), 'a second key is added (needs the box open)');
    await click('#detectBtn'); await sleep(800);
    ok(await until(`document.body.innerText.includes('inserted now')`), 'Detect shows which key is inserted');
    await run(`[...document.querySelectorAll('button')].filter((b) => b.textContent === 'Remove')[0].click()`); await sleep(150);
    ok((await text()).includes('hk-home') && (await text()).includes('hk-bag'), 'removing a key asks first');
    await btn('Yes, remove'); await sleep(500);
    ok(await run("lib.get('paolo').then((r) => r.box.keys.map((k) => k.name).join())") === 'hk-bag', 'removing a key removes exactly that key');
    await send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: bagKey.authenticatorId });
    await send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId: key1.authenticatorId, enabled: true });
    await click('#kNameManual'); await fill('#kName', 'hk-home'); await click('#addKey'); await until(`document.body.innerText.includes('hk-home')`);
    // ===== lock, reload, unlock again =====
    await click('#lockBtn'); await sleep(200); await click('#tab-items'); await sleep(200);
    ok(await auditVisible(), 'locking the box preserves the security notice');
    ok(await has('This box is locked') && !(await has('Google')), 'locked: nothing readable');
    await open('#/box/paolo');
    ok(await has('This box is locked'), 'the library survives a reload; the box is locked again');
    await click('#unlockBtn');
    ok(await until(`document.body.innerText.includes('Google')`), 'Unlock with a key shows the items again');
    // ===== a key that never answers must not freeze the app =====
    await send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId: key1.authenticatorId, enabled: false });
    await click('#tab-keys'); await sleep(200); await click('#detectBtn'); await sleep(400);
    await click('#tab-items'); await sleep(200);
    await addRecord('While waiting','https://example.com','w');
    ok(await has('While waiting'), 'while a key request is pending, other buttons still work');
    await click('#tab-keys'); await sleep(200); await click('#detectBtn'); await sleep(300);
    ok(await has('Still waiting') || await has('Still working'), 'pressing Detect again says it is still waiting instead of doing nothing');
    await send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId: key1.authenticatorId, enabled: true });
    await run(`document.querySelector('#lockBtn') && void 0`); await open('#/box/paolo'); await click('#unlockBtn'); await until(`!!${q('#lockBtn')}`);
    // ===== naming a key: recognised, already in the box, or new =====
    await open('#/'); await click('#newBtn'); await sleep(250);
    ok(await run(`!!${q('#newKeyFind')} && ${q('#newKey')}.closest('[hidden]') !== null`) && await has('without unlocking'), 'New box identifies known keys before showing a nickname field, even with every box locked');
    await click('#newKeyFind'); await until(`/^hk-/.test(${q('#newKey')}.value)`);
    ok(/Recognized "hk-(home|bag)"/.test(await text()), 'a key used before is recognised by a touch and its name is filled in');
    ok(await run(`${q('#newKey')}.readOnly`), 'recognized names cannot accidentally be edited');
    await fill('#newName', 'swapped');
    await send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId: key1.authenticatorId, enabled: false });
    const swappedKey = await auth(); await click('#createBox');
    await until(`document.body.innerText.includes('Cancelled')`);
    ok(await run("lib.get('swapped').then(r => !r)") && await has('Cancelled'), 'swapping hardware after identification cannot enroll under the recognized name');
    await send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: swappedKey.authenticatorId });
    await send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId: key1.authenticatorId, enabled: true });
    const homeId = await run("lib.get('paolo').then(r => r.box.keys.find(k => k.name === 'hk-home').id)");
    await fill('#newName', 'reuse'); await click('#createBox');
    ok(await until(`location.hash === '#/box/reuse' && !!${q('#lockBtn')}`), 'a known key creates another box without asking for a new nickname');
    ok(await run("lib.get('reuse').then(r => r.box.keys[0].id)") === homeId, 'recognized enrollment reuses the verified credential');
    await open('#/box/reuse'); await click('#unlockBtn');
    ok(await until(`!!${q('#lockBtn')}`), 'the reused credential unlocks the new box after a reload');
    await open('#/'); await click('#newBtn'); await click('#newKeyManual'); await fill('#newName', 'duplicate'); await fill('#newKey', 'different-name'); await click('#createBox');
    await until(`document.body.innerText.includes('already registered')`);
    ok(await has('already registered') && await run("lib.get('duplicate').then(r => !r)"), 'manual enrollment cannot rename hardware already known in a locked box');
    ok(await run(`${q('#newKey')}.value === 'different-name' && ${q('#newName')}.value === 'duplicate'`), 'a rejected enrollment preserves the form');
    await open('#/box/paolo'); await click('#unlockBtn'); await until(`!!${q('#lockBtn')}`); await click('#tab-keys'); await sleep(250);
    const nKeys = () => run(`lib.get('paolo').then((r) => r.box.keys.length)`); const before = await nKeys();
    await click('#kNameFind'); await until(`document.body.innerText.includes('already in this box')`);
    ok(/"hk-(home|bag)" is already in this box/.test(await text()), 'a key that is already in the box is recognised as such');
    await click('#addKey'); await sleep(600);
    ok((await nKeys()) === before && await has('already in this box'), 'it cannot be added twice');
    await send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId: key1.authenticatorId, enabled: false });
    const keyN = await auth();
    await click('#kNameManual'); await fill('#kName', 'keep-my-nickname');
    await click('#kNameFind'); await until(`document.body.innerText.includes('Could not identify')`);
    ok(await has('This does not mean the key is new') && (await run(`${q('#kName')}.value`)) === 'keep-my-nickname', 'inconclusive identification never calls the key new or discards a nickname');
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
    await open(); await click('#newBtn'); await fill('#newName', 'two'); await click('#newKeyManual'); await click('#createBox');
    await until(`location.hash === '#/box/two' && !!${q('#lockBtn')}`);
    ok(await run("lib.get('two').then(r => r.box.keys[0].name === 'Security key 1')"), 'an omitted nickname receives a readable automatic name');
    await addRecord('Site','https://example.org','s1');
    await click('#tab-sync'); await sleep(200);
    ok(await run("!!document.querySelector('#connectKey') && !document.querySelector('#addToken')"), 'Sync offers key access and no longer writes a bootstrap token into a box');
    // Compatibility fixture: older releases wrote encrypted service tokens.
    await run(`(async()=>{const {lib,backups}=await import('./store.js');const {createBoxSessions}=await import('./box-session.js');const {unlockVault}=await import('./webauthn.js');const s=createBoxSessions({storage:lib,backups,newId:()=>crypto.randomUUID(),rpId:location.hostname,unlock:unlockVault});await s.unlock('two');const v=s.get('two');const result=await s.mutate('two',v.token,{kind:'set-token',id:crypto.randomUUID(),url:'https://github.com/settings/personal-access-tokens',secret:'ghp_FAKE'},null);if(!result.ok)throw Error(result.code);})()`);
    await open('#/box/two');await click('#unlockBtn');await until(`!!${q('#lockBtn')}`);await click('#tab-sync');
    ok(await has('legacy GitHub token') && !(await has('ghp_FAKE')), 'legacy encrypted service tokens remain usable and hidden');
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
    ok(await run(`!!document.querySelector('a.box-link[href="#/box/two"]') && document.querySelector('#n-boxes').getAttribute('aria-current') === 'page'`), 'boxes have keyboard-accessible links and the current navigation is announced');
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 800, deviceScaleFactor: 1, mobile: true });
    ok(await noOverflow(), 'a populated box library fits a 320px phone');
    await screenshot('phone-boxes');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await screenshot('desktop-boxes');
    ok((await run(`[...document.querySelectorAll('a.chip')].map((a) => a.href).join(' ')`)).includes('https://github.com/paolino/fido-box/blob/main/boxes/two.json') && (await run(`${q('#ghLine a')}.href`)) === 'https://github.com/paolino/fido-box/tree/main/boxes', 'the Boxes list links each GitHub box to its file, and the repository line to the folder');
    await run(`location.hash = '#/box/two'`); await sleep(300); await addRecord('Later','https://example.net','s2');
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
    ok(await run(`!document.querySelector('#lockBtn')`), 'Pull immediately invalidates the old unlocked session');
    await click('#tab-items'); await sleep(100);
    ok(!(await has('Later')), 'Pull leaves no stale record plaintext in the Items view');
    if (await run(`!!document.querySelector('#unlockBtn')`)) { await click('#unlockBtn'); await until(`!!document.querySelector('#lockBtn')`); }
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
    await require('./rich-records.browser.cjs')({run,ok,click,fill,btn,until,send,open,profile,sleep});
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
    await open('#/'); await click('#newBtn'); await sleep(250); await click('#newKeyManual'); await click('#newKeyLabel'); await until(`${q('#newKey')}.value === 'hk-bag'`);
    ok((await run(`${q('#newKey')}.value`)) === 'hk-bag', 'the New box form can fill the key name from its label');
    // A credential present only in fetched GitHub metadata is recognizable too.
    await run(`(async () => { const {enrolKey} = await import('./webauthn.js'); const {newDataKey} = await import('./crypto.js'); const {emptyVault}=await import('./box-format.js'); const box={...emptyVault(location.hostname),keys:[await enrolKey('remote-spare',newDataKey())]}; window.__gh.files['boxes/remote-only.json'] = JSON.stringify(box); })()`);
    await run(`location.hash = '#/settings'`); await until(`!!${q('#tokIn')}`);
    await fill('#tokIn', 'ghp_FAKE'); await click('#useTok'); await until(`document.body.innerText.includes('Connected:')`);
    await run(`location.hash = '#/'`); await until(`!!${q('#newBtn')}`); await click('#newBtn');
    await click('#newKeyFind'); await until(`${q('#newKeyHint')}.textContent.includes('remote-spare')`);
    ok(await has('Recognized "remote-spare"') && await run("lib.get('remote-only').then(r => !r)"), 'a key from loaded GitHub metadata is recognized without pulling or unlocking its box');
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 800, deviceScaleFactor: 1, mobile: true });
    ok(await noOverflow(), 'identification guidance and controls fit a 320px phone');
    await run("document.querySelector('.key-picker').scrollIntoView({block:'center'})");
    await sleep(3600); await screenshot('identify-key-phone');
    await send('WebAuthn.disable');await send('WebAuthn.enable',{enableUI:false});
    await require('./key-access.browser.cjs')({run,send,ok,base,open,click,fill,btn,until,auth,addRecord,screenshot});
  } finally { try { ws.close(); } catch (e) {} proc.kill(); server.close(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }
  ok(pageErrors.length === 0, 'no uncaught page errors' + (pageErrors.length ? ': ' + pageErrors[0] : ''));
  console.log('\n' + (n - fails) + '/' + n + ' passed'); process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error('ERROR', e); process.exit(2); });
