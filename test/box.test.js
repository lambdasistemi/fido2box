const B = require('../web/box.js');
const assert = require('assert');
let n = 0; const ok = (name) => { n++; console.log('ok  ' + name); };
const prf = (s) => B.enc.encode(s.padEnd(32, '.')).slice(0, 32);       // a fake "secret only this key can make"
(async () => {
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
  console.log('\n' + n + ' checks passed');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
