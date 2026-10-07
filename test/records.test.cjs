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
  assert.equal(failures, 0, `${failures}/${count} record-model checks failed`);
  console.log(`${count} record-model checks passed`);
}

module.exports = recordsTests;
if (require.main === module) recordsTests().catch(e => { console.error(e); process.exitCode = 1; });
