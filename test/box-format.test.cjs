const assert = require('node:assert/strict');
module.exports = async function boxFormatTests() {
  const F = await import('../web/box-format.js');
  const bytes = n => Buffer.alloc(n, 1).toString('base64');
  const key = { name: 'Test key', id: bytes(32), wrapIv: bytes(12), wrapped: bytes(48) };
  const sealed = { iv: bytes(12), ct: bytes(16) };
  const v1 = { v: 1, entries: [key], ...sealed };
  const v2 = { v: 2, keys: [key], items: [sealed] };
  const v3 = { v: 3, keys: [key], items: [sealed], rev: 2, rpId: 'localhost' };
  let count = 0, failed = 0;
  const check = (name, fn) => { count++; try { fn(); console.log('ok  ' + name); } catch (e) { failed++; console.error('FAIL ' + name + ': ' + e.message); } };
  check('source reading retains exact whitespace and unknown encrypted members', () => {
    const text = ' { "v": 17, "future": "retain" }\n';
    assert.deepEqual(F.readSource(text), { ok: true, value: { text, value: JSON.parse(text) } });
    assert.deepEqual(F.readSource('{broken'), { ok: false, code: 'Invalid' });
  });
  check('supported envelopes keep version-directed keys without fallback', () => {
    for (const box of [v1, v2, v3]) {
      const result = F.inspectBox(box);
      assert.equal(result.writable, true);
      assert.deepEqual(result.box, box);
      assert.deepEqual(F.keysOf(box), [key]);
    }
    assert.deepEqual(F.keysOf({ v: 9, keys: [key] }), []);
  });
  check('unknown envelope, key and ciphertext members remain readable but not writable', () => {
    for (const box of [{ ...v3, future: 1 }, { ...v3, keys: [{ ...key, future: 1 }] }, { ...v3, items: [{ ...sealed, future: 1 }] }]) {
      const result = F.inspectBox(box);
      assert.deepEqual(result.box, box);
      assert.equal(result.writable, false);
      assert.equal(result.code, 'Unsupported');
      assert.equal(F.buildBox(box, [], [key], 'localhost').ok, false);
    }
  });
  check('ambiguous or malformed envelopes cannot be read as a different version', () => {
    for (const box of [null, [], {}, { ...v3, v: 8 }, { ...v1, keys: [key] }, { ...v2, entries: [key] }, { ...v3, items: null }, { ...v3, keys: [key, key] }, { ...v3, rpId: '' }, { ...v3, rev: undefined }, { ...v3, rpId: undefined }]) {
      assert.equal(F.inspectBox(box).writable, false);
      assert.equal(F.inspectBox(box).box, null);
    }
  });
  check('invalid revisions and malformed base64 are refused before encryption', () => {
    for (const rev of [-1, 1.5, '3', Number.MAX_SAFE_INTEGER + 1, null]) assert.equal(F.inspectBox({ ...v2, rev }).box, null);
    for (const item of [{ ...sealed, iv: '!!!' }, { ...sealed, iv: bytes(11) }, { ...sealed, ct: bytes(15) }, { ...sealed, ct: 42 }]) assert.equal(F.inspectBox({ ...v3, items: [item] }).box, null);
    for (const patch of [{ id: '' }, { id: '%%%=' }, { wrapIv: bytes(1) }, { wrapped: bytes(16) }, { name: 7 }]) assert.equal(F.inspectBox({ ...v3, keys: [{ ...key, ...patch }] }).box, null);
  });
  check('new and migrated boxes use v3 and keep source RP identity and keys', () => {
    assert.deepEqual(F.emptyVault('localhost'), { v: 3, rev: 0, rpId: 'localhost', keys: [], items: [] });
    const built = F.buildBox({ ...v1, rpId: 'original.example' }, [sealed], [key], 'other.example');
    assert.deepEqual(built, { ok: true, value: { v: 3, rev: 1, rpId: 'original.example', keys: [key], items: [sealed] } });
    assert.equal(F.buildBox(v2, [], [key], 'localhost').value.rev, 1);
    assert.equal(F.buildBox(v3, [], [key], 'localhost').value.rev, 3);
    assert.equal(F.buildBox({ ...v3, rev: Number.MAX_SAFE_INTEGER }, [], [key], 'localhost').ok, false);
    assert.equal(F.buildBox(v3, [{ iv: '', ct: '' }], [key], 'localhost').ok, false);
    assert.deepEqual(F.readSource(F.sourceFromBox(v3).text).value.value, v3);
  });
  assert.equal(failed, 0, `${failed}/${count} envelope checks failed`);
  console.log(`${count} envelope checks passed`);
};
if (require.main === module) module.exports().catch(e => { console.error(e); process.exitCode = 1; });
