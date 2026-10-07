const assert = require('node:assert/strict');
const fixtures = require('./fixtures/legacy-boxes.json');
module.exports = async () => {
  const B = await import('../web/crypto.js');
  const data = await B.unwrapDataKey(fixtures.v1.entries[0], B.unb64(fixtures.prf));
  const key = await crypto.subtle.importKey('raw', data, 'AES-GCM', false, ['decrypt']);
  const note = B.dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: B.unb64(fixtures.v1.iv) }, key, B.unb64(fixtures.v1.ct)));
  assert.equal(note, fixtures.note);
  const triples = await Promise.all(fixtures.v2.items.map(async item => JSON.parse(await B.decryptText(data,item))));
  assert.deepEqual(triples, fixtures.triples);
  console.log('ok  frozen synthetic fixtures decrypt with the pre-change cryptographic construction');

  // Frozen pre-change parseItem/encryptItem behavior from 7b0bd86:web/crypto.js.
  // This negative control demonstrates why the migration warning forbids downgrade.
  function oldParseItem(text) {
    try {
      const o = JSON.parse(text);
      if (o && typeof o.secret === 'string') return { title: typeof o.title === 'string' ? o.title : '', url: typeof o.url === 'string' ? o.url : '', secret: o.secret };
    } catch { /* the old reader treated everything else as one note */ }
    const m = text.match(/A3-[A-Z0-9]{6}(-[A-Z0-9]{5,6}){5}/);
    return { title: 'Secret', url: '', secret: m ? m[0] : text };
  }
  const codec = await import('../web/record-codec.js');
  const record = { format:'fido2box-record', version:1, type:'recovery', id:'downgrade-control', title:'Recovery', fields:[
    {id:'one',name:'Account',kind:'text',hidden:false,value:'synthetic@example.test'},
    {id:'two',name:'Codes',kind:'multiline',hidden:true,value:'one\ntwo'},
  ] };
  const encoded = codec.encodeRecord(record); assert.ok(encoded.ok);
  const sealed = await B.encryptText(data, encoded.value);
  const old = oldParseItem(await B.decryptText(data, sealed));
  assert.equal(old.title, 'Secret');
  assert.equal(old.secret, encoded.value);
  const rewritten = await B.encryptText(data, JSON.stringify({title:old.title,url:old.url,secret:old.secret}));
  assert.notEqual(codec.decodeRecord(await B.decryptText(data, rewritten), 3, []).status, 'ok',
    'the old writer replaces structured fields with a legacy triple; it is not a safe downgrade');
  console.log('ok  frozen old reader/writer negative control cannot preserve v3 structured records');
};
