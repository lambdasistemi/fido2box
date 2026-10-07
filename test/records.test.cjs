const assert = require('node:assert/strict');

async function recordsTests() {
  const R = await import('../web/records.js');
  let count = 0, failures = 0;
  const check = (name, test) => { count++; try { test(); console.log('ok  ' + name); } catch (error) { failures++; console.error('FAIL ' + name + ': ' + error.message); } };
  const field = (id, value = '') => ({ id, name: 'Secret', kind: 'multiline', hidden: true, value });
  const record = (fields = []) => ({ format: 'fido2box-record', version: 1, type: 'recovery', id: 'record', title: 'Recovery', fields });
  const add = (draft, item) => R.changeDraft(draft, { kind: 'add', field: item });
  const update = (draft, fieldId, patch) => R.changeDraft(draft, { kind: 'update', fieldId, patch });
  const confirm = (draft, fieldId, value) => R.changeDraft(draft, { kind: 'confirmation', fieldId, value });
  const finish = (draft) => { const result = R.finishDraft(draft); assert.equal(result.ok, true); return result.value; };

  check('a titled record needs no fields or website', () => {
    assert.deepEqual(R.createRecord('record', 'Recovery'), record());
    assert.deepEqual(R.validateRecord(record()), []);
    assert.deepEqual(finish(R.beginDraft(record())), record());
  });
  check('a secret-only record and an empty website retain their values', () => {
    let draft = add(R.beginDraft(record()), field('secret', ' 00\r\n0123 '));
    draft = add(draft, { id: 'website', name: 'Website', kind: 'url', hidden: false, value: '' });
    assert.deepEqual(finish(draft).fields.map(f => f.value), [' 00\r\n0123 ', '']);
  });
  check('field suggestions have familiar independent kind and hiding defaults', () => {
    for (const [name, kind, hidden] of [['Account', 'text', false], ['Password or recovery key', 'text', true], ['Website', 'url', false], ['Backup codes', 'multiline', true], ['Notes', 'multiline', false]]) {
      assert.deepEqual(R.suggestField(name, 'field'), { id: 'field', name, kind, hidden, value: '' });
    }
    assert.throws(() => R.suggestField('unknown', 'field'), /Invalid/);
  });
  check('renaming a record preserves every ordered field exactly', () => {
    const original = record([field('one', ' a\r\nb\rc\n😀 '), field('two', '0000')]);
    const before = structuredClone(original);
    const draft = R.changeDraft(R.beginDraft(original), { kind: 'title', value: 'Changed' });
    assert.deepEqual(finish(draft).fields, before.fields);
    assert.deepEqual(original, before);
  });
  check('editing names and hiding never trims or normalizes untouched values', () => {
    const original = record([field('one', ' \r\n😀\r00\n ')]);
    const draft = update(R.beginDraft(original), 'one', { name: ' New label ', kind: 'text', hidden: false });
    assert.equal(finish(draft).fields[0].value, original.fields[0].value);
    assert.equal(finish(draft).fields[0].name, ' New label ');
  });
  check('duplicate labels are independent because edits target field identity', () => {
    const draft = update(R.beginDraft(record([field('one', 'a'), field('two', 'b')])), 'two', { value: 'changed' });
    assert.deepEqual(finish(draft).fields.map(f => f.value), ['a', 'changed']);
  });
  check('removal and undo restore original ordering even after multiple removals', () => {
    const original = record([field('a'), field('b'), field('c')]);
    let draft = R.beginDraft(original);
    draft = R.changeDraft(draft, { kind: 'remove', fieldId: 'b' });
    draft = R.changeDraft(draft, { kind: 'remove', fieldId: 'a' });
    draft = R.changeDraft(draft, { kind: 'undo', fieldId: 'b' });
    draft = R.changeDraft(draft, { kind: 'undo', fieldId: 'a' });
    assert.deepEqual(finish(draft), original);
  });
  check('secret confirmation is optional and never serialized', () => {
    const original = record([field('one', ' value ')]);
    const draft = R.beginDraft(original);
    assert.deepEqual(finish(draft), original);
    assert.deepEqual(finish(confirm(draft, 'one', ' value ')), original);
  });
  check('empty second entry is not filled from the secret and blocks saving', () => {
    const draft = confirm(R.beginDraft(record([field('one', 'secret')])), 'one', '');
    assert.equal(R.finishDraft(draft).ok, false);
    assert.ok(R.validateDraft(draft).some(i => i.code === 'ConfirmationMismatch' && i.fieldId === 'one'));
    assert.equal(JSON.stringify(R.validateDraft(draft)).includes('secret'), false);
  });
  check('both entries are compared exactly after either changes', () => {
    let draft = confirm(R.beginDraft(record([field('one', ' a\n')])), 'one', ' a\n');
    assert.equal(R.finishDraft(draft).ok, true);
    draft = update(draft, 'one', { value: 'a\n' });
    assert.equal(R.finishDraft(draft).ok, false);
    draft = confirm(draft, 'one', 'a\r\n');
    assert.equal(R.finishDraft(draft).ok, false);
    draft = confirm(draft, 'one', 'a\n');
    assert.equal(R.finishDraft(draft).ok, true);
  });
  check('turning confirmation off permits saving without a second entry', () => {
    let draft = confirm(R.beginDraft(record([field('one', 'secret')])), 'one', 'wrong');
    draft = confirm(draft, 'one', null);
    assert.equal(R.finishDraft(draft).ok, true);
  });
  check('removal discards confirmation and undo does not resurrect it', () => {
    let draft = confirm(R.beginDraft(record([field('one', 'secret')])), 'one', 'wrong');
    draft = R.changeDraft(draft, { kind: 'remove', fieldId: 'one' });
    draft = R.changeDraft(draft, { kind: 'undo', fieldId: 'one' });
    assert.equal(R.finishDraft(draft).ok, true);
    assert.deepEqual(draft.confirmations, []);
  });
  check('empty values can be deliberately confirmed with another empty value', () => {
    assert.equal(R.finishDraft(confirm(R.beginDraft(record([field('one')])), 'one', '')).ok, true);
  });
  check('legacy blank titles survive untouched but cannot become different blanks', () => {
    const original = { ...record(), title: '  ', legacyUntitled: true };
    assert.deepEqual(finish(R.beginDraft(original)), original);
    const renamed = R.changeDraft(R.beginDraft(original), { kind: 'title', value: '\t' });
    assert.equal(R.finishDraft(renamed).ok, false);
    const valid = R.changeDraft(R.beginDraft(original), { kind: 'title', value: 'Named' });
    assert.equal(finish(valid).legacyUntitled, undefined);
  });
  check('stored schema rejects malformed or unknown data rather than projecting it away', () => {
    const invalid = [null, [], {}, { ...record(), future: true }, { ...record(), type: 'github-token' }, { ...record(), version: 2 }, { ...record(), title: '' }, { ...record(), title: 'github-token' }, { ...record(), id: '' }, { ...record(), fields: null }, { ...record(), legacyUntitled: true }, record([field('same'), field('same')]), record([{ ...field('one'), extra: 1 }]), record([{ ...field('one'), kind: 'script' }]), record([{ ...field('one'), name: ' \t' }]), record([{ ...field('one'), value: 1 }]), record([{ ...field('one'), hidden: 'yes' }])];
    for (const value of invalid) assert.ok(R.validateRecord(value).length > 0);
  });
  check('draft changes cannot mutate identity or add unmodeled field properties', () => {
    const draft = R.beginDraft(record([field('one')]));
    assert.throws(() => update(draft, 'one', { id: 'other' }), /Invalid/);
    assert.throws(() => update(draft, 'one', { unexpected: true }), /Invalid/);
    assert.throws(() => add(draft, field('one')), /Invalid/);
    assert.throws(() => update(draft, 'missing', { value: 'x' }), /Invalid/);
    assert.throws(() => confirm(draft, 'missing', ''), /Invalid/);
  });
  check('drafts detach their input and returned records cannot alter earlier drafts', () => {
    const input = record([field('one', 'saved')]);
    const draft = R.beginDraft(input);
    input.fields[0].value = 'outside';
    assert.equal(finish(draft).fields[0].value, 'saved');
    const next = update(draft, 'one', { value: 'next' });
    assert.equal(finish(draft).fields[0].value, 'saved');
    assert.equal(finish(next).fields[0].value, 'next');
  });
  check('generated exact-text records survive draft edits and JSON round trips', () => {
    const fragments = ['', '000', ' a ', '\r', '\n', '\r\n', '😀', '<script>', '__proto__'];
    for (let i = 0; i < 256; i++) {
      const original = record(Array.from({ length: i % 21 }, (_, j) => field(String(j), fragments[(i + j) % fragments.length].repeat(1 + i % 8))));
      const draft = R.changeDraft(R.beginDraft(original), { kind: 'title', value: 'Renamed ' + i });
      assert.deepEqual(finish(draft).fields, original.fields);
      assert.deepEqual(JSON.parse(JSON.stringify(finish(draft))).fields, original.fields);
    }
    const large = record(Array.from({ length: 20 }, (_, i) => field(String(i), 'x'.repeat(10000))));
    assert.deepEqual(finish(R.beginDraft(large)), large);
  });
  const C = await import('../web/record-codec.js');
  const ids = ['legacy-record', 'legacy-secret', 'legacy-url'];
  const decode = (text, version = 3, supplied = version === 3 ? [] : ids) => C.decodeRecord(text, version, supplied);
  const payload = result => { assert.equal(result.status, 'ok'); return result.payload; };
  const encoded = value => { const result = C.encodeRecord(value); assert.equal(result.ok, true); return result.value; };
  check('v1 preserves the whole note, including text around a recognizable recovery key', () => {
    const note = ' Before\r\nA3-ABCDEF-ABCDE-ABCDE-ABCDE-ABCDE-ABCDE\rAfter\n ';
    const value = payload(decode(note, 1));
    assert.deepEqual(value, { ...record([{ id: ids[1], name: 'Notes', kind: 'multiline', hidden: true, value: note }]), id: ids[0], title: 'Secret' });
  });
  check('v1 JSON-looking and empty notes are never interpreted as triples', () => {
    for (const note of ['', '{"title":"github-token","secret":"token"}', 'null', '[]']) {
      const value = payload(decode(note, 1));
      assert.equal(value.type, 'recovery');
      assert.equal(value.fields[0].value, note);
    }
  });
  check('v2 triples retain title, explicit empty URL and exact secret', () => {
    const old = { title: ' Legacy ', url: '', secret: ' 000\r\n😀 ' };
    const value = payload(decode(JSON.stringify(old), 2));
    assert.equal(value.id, ids[0]);
    assert.equal(value.title, old.title);
    assert.deepEqual(value.fields, [
      { id: ids[1], name: 'Secret', kind: 'text', hidden: true, value: old.secret },
      { id: ids[2], name: 'Website', kind: 'url', hidden: false, value: '' },
    ]);
    assert.equal(Object.hasOwn(value, 'legacyUntitled'), false);
  });
  check('v2 missing URL makes no field and blank titles get exact legacy provenance', () => {
    for (const title of [undefined, '', ' \r\n']) {
      const value = payload(decode(JSON.stringify({ title, secret: '' }), 2));
      assert.equal(value.title, title ?? '');
      assert.equal(value.legacyUntitled, true);
      assert.equal(value.fields.length, 1);
      assert.equal(value.fields[0].value, '');
      assert.deepEqual(payload(decode(encoded(value))), value);
    }
  });
  check('v2 refuses malformed triples without falling back to a note', () => {
    for (const text of ['not json', 'null', '[]', '42', '"secret"', '{}', '{"secret":1}', '{"secret":"private-marker","url":null}', '{"secret":"private-marker","title":false}']) {
      const result = decode(text, 2);
      assert.equal(result.status, 'invalid');
      assert.equal(JSON.stringify(result).includes('private-marker'), false);
    }
  });
  check('v2 unknown members refuse conversion without discarding them', () => {
    assert.equal(decode('{"secret":"value","future":true}', 2).status, 'unsupported');
  });
  check('legacy reserved-title tokens retain URL and never become recovery records', () => {
    for (const url of [undefined, '', ' https://github.com/ ']) {
      const value = payload(decode(JSON.stringify({ title: 'github-token', url, secret: ' token\r\n ' }), 2));
      assert.deepEqual(value, { format: 'fido2box-record', version: 1, type: 'github-token', id: ids[0], title: 'github-token', url: url ?? '', secret: ' token\r\n ' });
      assert.deepEqual(payload(decode(encoded(value))), value);
    }
  });
  check('current records preserve every field and persisted identity through codec round trips', () => {
    for (let i = 0; i < 128; i++) {
      const value = record(Array.from({ length: i % 21 }, (_, j) => ({ ...field('f' + j, ' 000\r\n😀\r\t '.repeat(1 + i % 9)), name: 'duplicate', kind: ['text', 'multiline', 'url'][j % 3], hidden: j % 2 === 0 })));
      assert.deepEqual(payload(decode(encoded(value))), value);
    }
  });
  check('current unknown discriminators and members refuse both decoding and encoding', () => {
    for (const value of [{ ...record(), format: 'future' }, { ...record(), version: 2 }, { ...record(), type: 'other' }, { ...record(), extra: true }, record([{ ...field('one'), future: true }]), record([{ ...field('one'), kind: 'otp' }])]) {
      assert.equal(decode(JSON.stringify(value)).status, 'unsupported');
      assert.deepEqual(C.encodeRecord(value), { ok: false, code: 'Unsupported' });
    }
  });
  check('malformed current payloads refuse encoding and decoding with non-secret errors', () => {
    const token = { format: 'fido2box-record', version: 1, type: 'github-token', id: 'token', title: 'github-token', url: '', secret: 'private-marker' };
    for (const value of [null, [], {}, { ...record(), title: '' }, record([field('same'), field('same')]), record([{ ...field('one'), value: 7 }]), { ...token, secret: null }, { ...token, title: 'other' }, { ...token, id: '' }, { ...token, url: null }]) {
      const result = decode(JSON.stringify(value));
      assert.equal(result.status, 'invalid');
      assert.equal(JSON.stringify(result).includes('private-marker'), false);
      assert.deepEqual(C.encodeRecord(value), { ok: false, code: 'Invalid' });
    }
    assert.equal(decode('{bad json').status, 'invalid');
    assert.equal(decode(JSON.stringify({ ...token, fields: [] })).status, 'unsupported');
  });
  check('legacy conversion requires supplied unique IDs and current payloads never invent them', () => {
    for (const supplied of [[], ['a'], ['a', 'b', 'b'], ['a', '', 'c'], ['a', 'b', 'c', 'd']]) assert.equal(decode('note', 1, supplied).status, 'invalid');
    assert.equal(decode(JSON.stringify(record()), 3, ids).status, 'invalid');
    assert.equal(decode(JSON.stringify({ ...record(), id: undefined })).status, 'invalid');
    assert.equal(decode('note', 4, []).status, 'unsupported');
  });
  check('encoding a confirmed draft contains only the primary value, not editor state', () => {
    const draft = confirm(R.beginDraft(record([field('one', 'a\r\nb')])), 'one', 'a\r\nb');
    const value = payload(decode(encoded(finish(draft))));
    assert.deepEqual(value, record([field('one', 'a\r\nb')]));
    assert.deepEqual(C.encodeRecord(draft), { ok: false, code: 'Unsupported' });
  });
  assert.equal(failures, 0, `${failures}/${count} record-model checks failed`);
  console.log(`${count} record-model checks passed`);
}

module.exports = recordsTests;
if (require.main === module) recordsTests().catch(e => { console.error(e); process.exitCode = 1; });
