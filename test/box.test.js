let B;   // the modules under test (ES modules, imported below)
const assert = require('assert');
let n = 0; const ok = (name) => { n++; console.log('ok  ' + name); };
const prf = (s) => B.enc.encode(s.padEnd(32, '.')).slice(0, 32);       // a fake "secret only this key can make"
(async () => {
  B = { ...(await import('../web/crypto.js')), ...(await import('../web/github.js')), ...(await import('../web/url.js')) };
  // 1. new vault with one key and two items
  let data = B.newDataKey(), v = B.emptyVault();
  v = await B.addKeyEntry(v, 'hk-phone', B.enc.encode('credA'), prf('keyA'), data);
  v = await B.addItem(v, data, { title: '1Password', url: 'https://my.1password.com/signin', secret: 'A3-SECRETKEY' });
  v = await B.addItem(v, data, { title: 'Google', url: 'https://accounts.google.com', secret: 'g-backup-code' });
  assert.strictEqual(v.v, 2); assert.strictEqual(v.items.length, 2); ok('vault with 1 key and 2 items');
  // 2. unlock with key A and read both items
  let d = await B.unwrapDataKey(B.keysOf(v)[0], prf('keyA'));
  let items = await B.listItems(v, d);
  assert.deepStrictEqual(items.map((i) => i.title), ['1Password', 'Google']);
  assert.strictEqual(items[0].secret, 'A3-SECRETKEY'); assert.strictEqual(items[1].url, 'https://accounts.google.com'); ok('unlock with key A opens every item');
  // 3. the public file does not leak titles, urls or secrets
  const pub = JSON.stringify(v);
  for (const s of ['1Password', 'Google', 'A3-SECRETKEY', 'g-backup-code', 'accounts.google', 'my.1password']) assert.ok(!pub.includes(s), 'leaked ' + s);
  ok('public file contains none of the titles, addresses or secrets');
  // 4. a different key cannot open it
  await assert.rejects(B.unwrapDataKey(B.keysOf(v)[0], prf('keyB'))); ok('a different key is refused');
  // 5. add a second key (unlocked via A), then B opens everything too
  v = await B.addKeyEntry(v, 'hk-bag', B.enc.encode('credB'), prf('keyB'), d);
  const dB = await B.unwrapDataKey(B.keysOf(v)[1], prf('keyB'));
  assert.deepStrictEqual((await B.listItems(v, dB)).map((i) => i.title), ['1Password', 'Google']); ok('a second key added later opens the same items');
  // 6. add an item later with the data key from the second key
  v = await B.addItem(v, dB, { title: 'GitHub', url: 'https://github.com/login', secret: 'ghp-recovery' });
  assert.strictEqual((await B.listItems(v, d)).length, 3); ok('an item added later is visible to the first key');
  // 7. tampering is detected
  const t = JSON.parse(JSON.stringify(v)); const raw = Buffer.from(t.items[0].ct, 'base64'); raw[0] ^= 1; t.items[0].ct = raw.toString('base64');
  await assert.rejects(B.listItems(t, d)); ok('a modified item is detected, not silently accepted');
  // 8. legacy v1 box (one plain note) still opens, and upgrades keeping the keys
  const dl = B.newDataKey(); const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await crypto.subtle.importKey('raw', dl, 'AES-GCM', false, ['encrypt']);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, B.enc.encode('test note'));
  const w = await B.wrapDataKey(dl, prf('keyL'));
  const v1 = { v: 1, rpId: 'lambdasistemi.net', entries: [{ name: 'hk-home', id: B.b64(B.enc.encode('credL')), ...w }], iv: B.b64(iv), ct: B.b64(ct) };
  const dl2 = await B.unwrapDataKey(B.keysOf(v1)[0], prf('keyL'));
  const li = await B.listItems(v1, dl2); assert.strictEqual(li[0].secret, 'test note'); assert.strictEqual(li[0].url, '');
  const up = await B.upgrade(v1, dl2); assert.strictEqual(up.v, 2); assert.strictEqual(B.keysOf(up).length, 1);
  assert.strictEqual((await B.listItems(up, dl2))[0].secret, 'test note'); ok('the published v1 test box opens and upgrades to v2');
  // 9. a v1 note holding a Secret Key is recognised
  assert.strictEqual(B.parseItem('foo\nSecret Key: A3-LHYDTN-ABCDEF-GHJKL-MNPQR-STUVW-XYZ23\n').secret, 'A3-LHYDTN-ABCDEF-GHJKL-MNPQR-STUVW-XYZ23'); ok('an older note with a Secret Key still gives just the key');
  // 10. safe urls
  const s = B.safeUrl;
  assert.ok(s('https://my.1password.com/signin')); assert.ok(s('http://localhost:8099/x'));
  for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'http://example.com', 'ftp://x.y', 'not a url', '']) assert.strictEqual(s(bad), '', bad);
  ok('only https (and http on localhost) addresses may be opened');
  // 9. saving to GitHub (against a fake API)
  {
    const fakeGh = (state) => async (url, o = {}) => {
      state.calls.push({ url, method: o.method || 'GET', headers: o.headers, body: o.body });
      const res = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
      if (!o.method) return state.get || res(404, {});
      return state.put || res(201, { commit: { sha: 'abc1234def' } });
    };
    const text = JSON.stringify({ v: 2, rev: 2, keys: [], items: [] }, null, 2);
    const asFile = (t) => ({ sha: 'filesha', content: Buffer.from(t).toString('base64').replace(/(.{60})/g, '$1\n') });
    const err = async (p) => { try { await p; return null; } catch (e) { return e; } };
    // new file: no sha sent, token in the header, content is the box
    let st = { calls: [] };
    assert.strictEqual(await B.saveToGitHub('paolino/fido-box', 'tok', text, 2, fakeGh(st)), 'abc1234def');
    let put = st.calls.find((c) => c.method === 'PUT'), body = JSON.parse(put.body);
    assert.strictEqual(put.url, 'https://api.github.com/repos/paolino/fido-box/contents/box.json'); assert.strictEqual(put.headers.Authorization, 'Bearer tok');
    assert.strictEqual(Buffer.from(body.content, 'base64').toString(), text); assert.ok(!('sha' in body)); assert.strictEqual(body.message, 'box rev 2');
    ok('save: a new file is created with one commit, token in the header, no sha');
    // older remote: replaced, with its sha
    st = { calls: [], get: { status: 200, ok: true, json: async () => asFile(JSON.stringify({ rev: 1 })) } };
    await B.saveToGitHub('o/r', 't', text, 2, fakeGh(st)); assert.strictEqual(JSON.parse(st.calls.find((c) => c.method === 'PUT').body).sha, 'filesha');
    ok('save: an older remote box is replaced using its sha');
    // newer or equal remote with different content: refused, nothing written
    for (const r of [2, 5]) {
      st = { calls: [], get: { status: 200, ok: true, json: async () => asFile(JSON.stringify({ rev: r, other: 1 })) } };
      const e = await err(B.saveToGitHub('o/r', 't', text, 2, fakeGh(st)));
      assert.ok(e && e.name === 'RemoteNewer' && e.rev === r); assert.ok(!st.calls.some((c) => c.method === 'PUT'));
    }
    ok('save: a remote box with the same or a higher rev is never overwritten');
    // identical: nothing to do
    st = { calls: [], get: { status: 200, ok: true, json: async () => asFile(text) } };
    assert.strictEqual(await B.saveToGitHub('o/r', 't', text, 2, fakeGh(st)), 'unchanged'); assert.ok(!st.calls.some((c) => c.method === 'PUT'));
    ok('save: identical content writes nothing');
    // errors
    st = { calls: [], get: { status: 401, ok: false, json: async () => ({}) } };
    assert.strictEqual((await err(B.saveToGitHub('o/r', 't', text, 2, fakeGh(st)))).name, 'BadToken');
    st = { calls: [], put: { status: 404, ok: false, json: async () => ({}) } };
    assert.strictEqual((await err(B.saveToGitHub('o/r', 't', text, 2, fakeGh(st)))).name, 'NoRepo');
    st = { calls: [], put: { status: 422, ok: false, json: async () => ({}) } };
    assert.strictEqual((await err(B.saveToGitHub('o/r', 't', text, 2, fakeGh(st)))).name, 'Conflict');
    ok('save: bad token, unreachable repository and conflicts are told apart');
    // large files survive base64 (was a stack limit with spread)
    const big = new Uint8Array(300000).map((_, i) => i % 251); assert.deepStrictEqual(B.unb64(B.b64(big)), big);
    ok('base64 handles a 300 KB file');
  }
  // 10. listing and fetching boxes in the repository
  {
    const res = (status, body) => ({ status, ok: status === 200, json: async () => body });
    const urls = [];
    const f = (map) => async (u) => { urls.push(u); return map[u.replace('https://api.github.com/repos/o/r', '')] || res(404, {}); };
    const dir = res(200, [{ type: 'file', name: 'paolo.json' }, { type: 'file', name: 'notes.txt' }, { type: 'dir', name: 'x' }, { type: 'file', name: '../evil.json' }, { type: 'file', name: 'wife.json' }]);
    assert.deepStrictEqual(await B.listRemote('o/r', 't', f({ '/contents/boxes': dir })), ['paolo', 'wife']); ok('list: only well-named .json files are boxes');
    assert.deepStrictEqual(await B.listRemote('o/r', 't', f({ '': res(200, {}) })), []); ok('list: a repository with no boxes folder is an empty list');
    let e = null; try { await B.listRemote('o/r', 't', f({})); } catch (x) { e = x; } assert.strictEqual(e && e.name, 'NoRepo'); ok('list: an unreachable repository is told apart');
    e = null; try { await B.listRemote('o/r', 't', f({ '/contents/boxes': res(401, {}) })); } catch (x) { e = x; } assert.strictEqual(e && e.name, 'BadToken'); ok('list: a refused token is told apart');
    const box = { v: 2, rev: 4, keys: [], items: [] };
    const got = await B.fetchRemote('o/r', 't', 'paolo', f({ '/contents/boxes/paolo.json': res(200, { content: Buffer.from(JSON.stringify(box)).toString('base64') }) }));
    assert.deepStrictEqual(got, box); assert.strictEqual(await B.fetchRemote('o/r', 't', 'zzz', f({})), null); ok('fetch: a box is read and parsed; a missing one is null');
    const calls = []; await B.saveToGitHub('o/r', 't', '{"rev":1}', 1, async (u, o = {}) => { calls.push(u); return o.method ? { status: 201, ok: true, json: async () => ({ commit: { sha: 'abcdef0' } }) } : { status: 404, ok: false, json: async () => ({}) }; }, 'boxes/paolo.json');
    assert.ok(calls.every((u) => u.endsWith('/contents/boxes/paolo.json'))); ok('save: writes to the path it is given');
    assert.ok(B.NAME_RE.test('paolo_2-b') && !B.NAME_RE.test('a/b') && !B.NAME_RE.test('') && !B.NAME_RE.test('x'.repeat(41))); ok('box names: letters, digits, - and _, up to 40');
  }
  console.log('\n' + n + ' checks passed');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
