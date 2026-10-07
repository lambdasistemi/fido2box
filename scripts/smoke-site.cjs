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
    for (const [route, expected, diagramCount = 0] of [
      ['/', '<title>fido2box</title>'], ['/crypto.js', 'wrapDataKey'],
      ['/records.js','finishDraft'], ['/record-codec.js','decodeRecord'],
      ['/box-format.js','readSource'], ['/box-session.js','createBoxSessions'],
      ['/record-session.js','createRecordSession'], ['/record-view.js','recordView'],
      ['/record-editor.js','recordEditor'], ['/dom.js','element'], ['/clipboard.js','createClipboardController'],
      ['/key-access.js','readAccess'], ['/key-access-codec.js','decodeAccess'],
      ['/github-access-session.js','createGitHubAccess'], ['/github-access-view.js','createGitHubAccessView'],
      ['/docs/assets/recovery-path.svg', '<svg'],
      ['/docs/', 'fido2box', 1], ['/docs/development/', 'Development'],
      ['/docs/recovery/', 'GitHub access', 1],
      ['/docs/state/', 'What changes when I act?', 3],
      ['/docs/assets/state-explorer.js', 'state-action'],
      ['/docs/architecture/system/', 'Context and trust boundaries', 5],
      ['/docs/architecture/roadmap/', 'Decisions and required evidence', 1],
      ['/docs/architecture/system-design-skill/', 'Plan the formal design loop', 1],
    ]) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200, route);
      const html = await response.text();
      assert.ok(html.includes(expected), 'unexpected content at ' + route);
      const diagramLinks = [...html.matchAll(/href="([^"]+\.mmd)"/g)];
      assert.equal(diagramLinks.length, diagramCount, 'diagram source count at ' + route);
      for (const match of diagramLinks) {
        const source = await fetch(new URL(match[1], base + route));
        assert.equal(source.status, 200, 'diagram source at ' + route);
        assert.match(await source.text(), /^(flowchart|sequenceDiagram|stateDiagram|erDiagram)/, 'diagram source bytes');
      }
    }
    console.log('ok  built app and docs respond on an isolated localhost port');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
