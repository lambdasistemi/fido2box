let B;   // the modules under test (ES modules, imported below)
const assert = require('assert');
let n = 0; const ok = (name) => { n++; console.log('ok  ' + name); };
const prf = (s) => B.enc.encode(s.padEnd(32, '.')).slice(0, 32);       // a fake "secret only this key can make"
(async () => {
  B = { ...(await import('../web/crypto.js')), ...(await import('../web/box-format.js')), ...(await import('../web/record-codec.js')), ...(await import('../web/github.js')), ...(await import('../web/url.js')) };
  // 1. new vault with one key and two items
  const record = (title,url,secret) => ({format:'fido2box-record',version:1,type:'recovery',id:crypto.randomUUID(),title,fields:[
    {id:'secret',name:'Secret',kind:'text',hidden:true,value:secret},{id:'url',name:'Website',kind:'url',hidden:false,value:url}]});
  const addKey = async (box,name,id,secret,data) => ({...box,keys:[...B.keysOf(box),{name,id:B.b64(id),...await B.wrapDataKey(data,secret)}]});
  const add = async (box,data,item) => ({...box,items:[...box.items,await B.encryptText(data,B.encodeRecord(record(item.title,item.url,item.secret)).value)]});
  const read = async (box,data) => Promise.all(box.items.map(async item => {
    const decoded=B.decodeRecord(await B.decryptText(data,item),3,[]); assert.equal(decoded.status,'ok');
    return decoded.payload;
  }));
  let data = B.newDataKey(), v = B.emptyVault('localhost');
  v = await addKey(v, 'hk-phone', B.enc.encode('credA'), prf('keyA'), data);
  v = await add(v, data, { title: '1Password', url: 'https://my.1password.com/signin', secret: 'A3-SECRETKEY' });
  v = await add(v, data, { title: 'Google', url: 'https://accounts.google.com', secret: 'g-backup-code' });
  assert.strictEqual(v.v, 3); assert.strictEqual(v.items.length, 2); ok('vault with 1 key and 2 items');
  // 2. unlock with key A and read both items
  let d = await B.unwrapDataKey(B.keysOf(v)[0], prf('keyA'));
  let items = await read(v, d);
  assert.deepStrictEqual(items.map((i) => i.title), ['1Password', 'Google']);
  assert.strictEqual(items[0].fields[0].value, 'A3-SECRETKEY'); assert.strictEqual(items[1].fields[1].value, 'https://accounts.google.com'); ok('unlock with key A opens every item');
  // 3. the public file does not leak titles, urls or secrets
  const pub = JSON.stringify(v);
  for (const s of ['1Password', 'Google', 'A3-SECRETKEY', 'g-backup-code', 'accounts.google', 'my.1password']) assert.ok(!pub.includes(s), 'leaked ' + s);
  ok('public file contains none of the titles, addresses or secrets');
  // 4. a different key cannot open it
  await assert.rejects(B.unwrapDataKey(B.keysOf(v)[0], prf('keyB'))); ok('a different key is refused');
  // 5. add a second key (unlocked via A), then B opens everything too
  v = await addKey(v, 'hk-bag', B.enc.encode('credB'), prf('keyB'), d);
  const dB = await B.unwrapDataKey(B.keysOf(v)[1], prf('keyB'));
  assert.deepStrictEqual((await read(v, dB)).map((i) => i.title), ['1Password', 'Google']); ok('a second key added later opens the same items');
  // 6. add an item later with the data key from the second key
  v = await add(v, dB, { title: 'GitHub', url: 'https://github.com/login', secret: 'ghp-recovery' });
  assert.strictEqual((await read(v, d)).length, 3); ok('an item added later is visible to the first key');
  // 7. tampering is detected
  const t = JSON.parse(JSON.stringify(v)); const raw = Buffer.from(t.items[0].ct, 'base64'); raw[0] ^= 1; t.items[0].ct = raw.toString('base64');
  await assert.rejects(read(t, d)); ok('a modified item is detected, not silently accepted');
  // Published synthetic v1 fixtures predate the schema refactor.
  const fixture=require('./fixtures/legacy-boxes.json'), v1=fixture.v1;
  const dl2=await B.unwrapDataKey(B.keysOf(v1)[0],B.unb64(fixture.prf));
  const li=B.decodeRecord(await B.decryptText(dl2,v1),1,['legacy','note','unused']);
  assert.equal(li.status,'ok'); assert.equal(li.payload.fields[0].value,fixture.note);
  const sealed=await B.encryptText(dl2,B.encodeRecord(li.payload).value);
  const up=B.buildBox(v1,[sealed],B.keysOf(v1),'localhost');assert.ok(up.ok);
  assert.equal(up.value.v,3);assert.deepEqual(up.value.keys,v1.entries);
  assert.equal((await read(up.value,dl2))[0].fields[0].value,fixture.note);ok('the frozen v1 note migrates to v3 without losing text or keys');
  const whole=B.decodeRecord('foo\\nSecret Key: A3-LHYDTN-ABCDEF-GHJKL-MNPQR-STUVW-XYZ23\\n',1,['note','field','unused']);
  assert.equal(whole.payload.fields[0].value,'foo\\nSecret Key: A3-LHYDTN-ABCDEF-GHJKL-MNPQR-STUVW-XYZ23\\n');ok('a legacy note retains the recovery key and all surrounding text');
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
    st = { calls: [], get: { status: 200, ok: true, json: async () => asFile(JSON.stringify({v:2,rev:1,keys:[],items:[]})) } };
    await B.saveToGitHub('o/r', 't', text, 2, fakeGh(st)); assert.strictEqual(JSON.parse(st.calls.find((c) => c.method === 'PUT').body).sha, 'filesha');
    ok('save: an older remote box is replaced using its sha');
    // newer or equal remote with different content: refused, nothing written
    for (const r of [2, 5]) {
      st = { calls: [], get: { status: 200, ok: true, json: async () => asFile(JSON.stringify({v:2,rev:r,keys:[],items:[]})) } };
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
    assert.deepStrictEqual(got.value, box); assert.equal(got.text,JSON.stringify(box)); assert.strictEqual(await B.fetchRemote('o/r', 't', 'zzz', f({})), null); ok('fetch: a box is read and parsed; a missing one is null');
    const calls = []; await B.saveToGitHub('o/r', 't', '{"rev":1}', 1, async (u, o = {}) => { calls.push(u); return o.method ? { status: 201, ok: true, json: async () => ({ commit: { sha: 'abcdef0' } }) } : { status: 404, ok: false, json: async () => ({}) }; }, 'boxes/paolo.json');
    assert.ok(calls.every((u) => u.endsWith('/contents/boxes/paolo.json'))); ok('save: writes to the path it is given');
    assert.ok(B.NAME_RE.test('paolo_2-b') && !B.NAME_RE.test('a/b') && !B.NAME_RE.test('') && !B.NAME_RE.test('x'.repeat(41))); ok('box names: letters, digits, - and _, up to 40');
  }
  console.log('\n' + n + ' checks passed');
  await require('./records.test.cjs')();
  await require('./box-format.test.cjs')();
  await require('./legacy-fixtures.test.cjs')();
  await require('./clipboard.test.cjs')();
  await require('./github-source.test.cjs')();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
