const assert = require('node:assert/strict');
const fixtures = require('./fixtures/legacy-boxes.json');
module.exports = async () => {
  const B = await import('../web/crypto.js');
  const data = await B.unwrapDataKey(fixtures.v1.entries[0], B.unb64(fixtures.prf));
  const key = await crypto.subtle.importKey('raw', data, 'AES-GCM', false, ['decrypt']);
  const note = B.dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: B.unb64(fixtures.v1.iv) }, key, B.unb64(fixtures.v1.ct)));
  assert.equal(note, fixtures.note);
  const triples = await B.listItems(fixtures.v2, data);
  assert.deepEqual(triples, fixtures.triples);
  console.log('ok  frozen synthetic fixtures decrypt with the pre-change cryptographic construction');
};
