const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

async function main() {
  assert.ok(process.argv[2], 'supply the built site directory');
  const root = path.resolve(process.argv[2]);
  const server = http.createServer(async (req, res) => {
    const route = new URL(req.url, 'http://localhost').pathname;
    const filename = path.resolve(root, '.' + route, route.endsWith('/') ? 'index.html' : '');
    if (!filename.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    try { res.end(await fs.readFile(filename)); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    for (const [route, expected] of [
      ['/', '<title>fido2box</title>'], ['/crypto.js', 'wrapDataKey'],
      ['/docs/', 'fido2box'], ['/docs/development/', 'Development'],
    ]) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200, route);
      assert.ok((await response.text()).includes(expected), 'unexpected content at ' + route);
    }
    console.log('ok  built app and docs respond on an isolated localhost port');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
