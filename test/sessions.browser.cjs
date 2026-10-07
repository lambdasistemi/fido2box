const fixtures = require('./fixtures/legacy-boxes.json');
module.exports = async ({ run, ok }) => {
  const results = await run(`(async () => {
    const fixture = ${JSON.stringify(fixtures)};
    const { createBoxSessions } = await import('./box-session.js');
    const { lib, backups } = await import('./store.js');
    const C = await import('./crypto.js'), F = await import('./box-format.js');
    const { createRecord } = await import('./records.js');
    const results = [], names = [];
    const assert = value => { if (!value) throw Error('Unexpected session outcome'); };
    const check = async (name, test) => { try { await test(); results.push([true, name]); } catch { results.push([false, name]); } };
    const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
    const data = await C.unwrapDataKey(fixture.v1.entries[0], C.unb64(fixture.prf));
    const ports = { storage: lib, backups, newId: () => crypto.randomUUID(), rpId: 'localhost', unlock: async () => data,
      enrol: async (name, key) => ({name, id: C.b64(C.enc.encode(crypto.randomUUID())), ...await C.wrapDataKey(key, C.unb64(fixture.prf))}) };
    const setup = async (box = fixture.v2, changes = {}) => {
      const name = 'session-' + names.length; names.push(name);
      const source = F.sourceFromBox(box);
      assert((await lib.compareAndSwap(name, null, source, new AbortController().signal)).ok);
      const sessions = createBoxSessions({...ports, ...changes});
      return { name, source, sessions };
    };
    await check('unlock retains complete legacy values and exposes no data key', async () => {
      const {name, source, sessions} = await setup(fixture.v1);
      const opened = await sessions.unlock(name); assert(opened.ok);
      assert(opened.value.payloads[0].fields[0].value === fixture.note);
      assert(!('data' in opened.value) && !('key' in opened.value));
      assert((await lib.get(name)).sourceText === source.text);
    });
    await check('first mutation requires approval and a read-verified exact-source backup', async () => {
      const {name, source, sessions} = await setup();
      const opened = await sessions.unlock(name); assert(opened.ok);
      const mutation = {kind:'upsert-record', record:createRecord('new', 'New')};
      assert((await sessions.mutate(name, opened.value.token, mutation, null)).code === 'MigrationRequired');
      assert(!(await sessions.prepareMigration(name, opened.value.token, false)).ok);
      const approval = await sessions.prepareMigration(name, opened.value.token, true); assert(approval.ok);
      assert((await backups.get(approval.value.backupId)).sourceText === source.text);
      const saved = await sessions.mutate(name, opened.value.token, mutation, approval.value); assert(saved.ok);
      const box = (await lib.get(name)).box; assert(box.v === 3 && box.rev === 5 && box.rpId === fixture.v2.rpId);
      assert(JSON.stringify(box.keys) === JSON.stringify(fixture.v2.keys));
      sessions.lock(name); const again = await sessions.unlock(name); assert(again.ok);
      assert(again.value.payloads[0].fields[0].value === fixture.triples[0].secret);
      assert(again.value.payloads[1].type === 'github-token' && again.value.payloads[1].url === fixture.triples[1].url);
      assert(again.value.payloads[2].title === 'New');
    });
    await check('backup failure blocks migration without changing active data', async () => {
      const {name, source, sessions} = await setup(fixture.v2, {backups:{...backups, retain:async()=>({ok:false,code:'BackupFailed'})}});
      const opened = await sessions.unlock(name); assert(opened.ok);
      assert((await sessions.prepareMigration(name, opened.value.token, true)).code === 'BackupFailed');
      assert((await lib.get(name)).sourceText === source.text);
    });
    await check('lock rejects deferred unlock publication', async () => {
      let started = false;
      const gate = deferred(), {name, sessions} = await setup(fixture.v2, {unlock:()=>{started=true; return gate.promise;}});
      const pending = sessions.unlock(name); await new Promise(r => setTimeout(r, 30)); assert(started); sessions.lock(name); gate.resolve(data);
      assert(!(await pending).ok && sessions.get(name) === null);
    });
    await check('replacement rejects deferred unlock and stays locked', async () => {
      const gate = deferred(), {name, source, sessions} = await setup(fixture.v2, {unlock:()=>gate.promise});
      const pending = sessions.unlock(name); await new Promise(r => setTimeout(r, 30));
      const next = F.sourceFromBox({...fixture.v2, keys:[], rev:4});
      assert((await sessions.replace(name, source.text, next)).ok); gate.resolve(data);
      assert(!(await pending).ok && sessions.get(name) === null);
      assert((await lib.get(name)).sourceText === next.text);
    });
    await check('same-revision replacement invalidates old record, key and token mutation routes', async () => {
      const {name, source, sessions} = await setup();
      const opened = await sessions.unlock(name); assert(opened.ok);
      const next = F.sourceFromBox({...fixture.v2, keys:[], rev:4});
      assert((await sessions.replace(name, source.text, next)).ok);
      for (const mutation of [{kind:'upsert-record',record:createRecord('new','New')}, {kind:'delete-record',recordId:opened.value.payloads[0].id},
        {kind:'set-token',id:'token',url:'',secret:'synthetic'}, {kind:'remove-token',id:opened.value.payloads[1].id},
        {kind:'add-key',name:'new'}, {kind:'remove-key',credentialId:fixture.v2.keys[0].id}]) {
        assert(!(await sessions.mutate(name, opened.value.token, mutation, null)).ok);
      }
      assert(sessions.get(name) === null && (await lib.get(name)).sourceText === next.text);
    });
    await check('failed replacement remains locked and locked legacy key removal never writes', async () => {
      const {name, source, sessions} = await setup(fixture.v1);
      const opened = await sessions.unlock(name); assert(opened.ok);
      assert(!(await sessions.replace(name, 'wrong predecessor', F.sourceFromBox(fixture.v2))).ok);
      assert(sessions.get(name) === null);
      assert(!(await sessions.mutate(name, opened.value.token, {kind:'remove-key',credentialId:fixture.v1.entries[0].id}, null)).ok);
      assert((await lib.get(name)).sourceText === source.text);
    });
    await check('failed save preserves both saved source and published plaintext', async () => {
      const {name, source, sessions} = await setup({...fixture.v2, v:3, items:[]}, {storage:{...lib, compareAndSwap:async()=>({ok:false,code:'StorageFailed'})}});
      const opened = await sessions.unlock(name); assert(opened.ok);
      assert((await sessions.mutate(name, opened.value.token, {kind:'upsert-record',record:createRecord('new','New')}, null)).code === 'StorageFailed');
      assert(sessions.get(name).payloads.length === 0 && (await lib.get(name)).sourceText === source.text);
    });
    await check('another tab changing the exact source refuses save and requires fresh unlock', async () => {
      const {name, source, sessions} = await setup({...fixture.v2, v:3, items:[]});
      const opened = await sessions.unlock(name); assert(opened.ok);
      const next = F.sourceFromBox({...fixture.v2, v:3, keys:[], items:[]});
      assert((await lib.compareAndSwap(name, source.text, next, new AbortController().signal)).ok);
      assert((await sessions.mutate(name, opened.value.token, {kind:'upsert-record',record:createRecord('new','New')}, null)).code === 'Conflict');
      assert(sessions.get(name) === null && (await lib.get(name)).sourceText === next.text);
    });
    await check('deferred key enrollment cannot overwrite a replacement', async () => {
      const gate = deferred(), {name, source, sessions} = await setup({...fixture.v2, v:3, items:[]}, {enrol:()=>gate.promise});
      const opened = await sessions.unlock(name); assert(opened.ok);
      const pending = sessions.mutate(name, opened.value.token, {kind:'add-key',name:'new'}, null);
      await new Promise(r => setTimeout(r, 30)); const next = F.sourceFromBox({...fixture.v2, keys:[]});
      assert((await sessions.replace(name, source.text, next)).ok); gate.resolve(fixture.v2.keys[0]);
      assert(!(await pending).ok && sessions.get(name) === null && (await lib.get(name)).sourceText === next.text);
    });
    await check('unknown sibling makes every write route read-only but supported records stay usable', async () => {
      const good = createRecord('readable','Readable');
      const seal = async value => { const iv = crypto.getRandomValues(new Uint8Array(12)), key = await crypto.subtle.importKey('raw',data,'AES-GCM',false,['encrypt']); return {iv:C.b64(iv),ct:C.b64(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,C.enc.encode(JSON.stringify(value))))}; };
      const {name, source, sessions} = await setup({...fixture.v2,v:3,items:await Promise.all([seal(good),seal({...good,id:'unknown',extra:true})])});
      const opened = await sessions.unlock(name); assert(opened.ok && !opened.value.writable && opened.value.payloads[0].title === 'Readable');
      for (const mutation of [{kind:'upsert-record',record:good},{kind:'delete-record',recordId:good.id},{kind:'set-token',id:'token',url:'',secret:'synthetic'},
        {kind:'remove-token',id:'token'},{kind:'add-key',name:'new'},{kind:'remove-key',credentialId:fixture.v2.keys[0].id}]) assert((await sessions.mutate(name,opened.value.token,mutation,null)).code === 'Unsupported');
      assert((await lib.get(name)).sourceText === source.text);
    });
    await check('new box enrollment uses absent-source comparison and publishes v3 only after commit', async () => {
      const name = 'session-created'; names.push(name); const sessions = createBoxSessions(ports);
      const result = await sessions.create(name,'first','localhost'); assert(result.ok && result.value.payloads.length === 0);
      assert((await lib.get(name)).box.v === 3);
      assert(!(await sessions.create(name,'second','localhost')).ok);
    });
    await check('all record, token and key edits persist through reload with one revision each', async () => {
      const {name,sessions} = await setup({...fixture.v2,v:3,items:[]});
      let view = (await sessions.unlock(name)).value, revision = 4;
      const write = async mutation => { const result = await sessions.mutate(name,view.token,mutation,null); assert(result.ok); view=result.value; assert((await lib.get(name)).box.rev === ++revision); };
      await write({kind:'upsert-record',record:createRecord('record','First')});
      await write({kind:'upsert-record',record:createRecord('record','Renamed')});
      await write({kind:'set-token',id:'token',url:'original url',secret:'synthetic token'});
      await write({kind:'add-key',name:'second'});
      const keys = (await lib.get(name)).box.keys; assert(keys.length === 2);
      await write({kind:'remove-key',credentialId:keys[1].id});
      assert(!(await sessions.mutate(name,view.token,{kind:'remove-key',credentialId:keys[0].id},null)).ok);
      sessions.lock(name); view=(await sessions.unlock(name)).value;
      assert(view.payloads[0].title === 'Renamed' && view.payloads[1].secret === 'synthetic token');
      await write({kind:'remove-token',id:'token'});
      await write({kind:'delete-record',recordId:'record'});
      sessions.lock(name); assert((await sessions.unlock(name)).value.payloads.length === 0);
    });
    await check('overlapping saves cannot both commit from one session token', async () => {
      const {name,sessions} = await setup({...fixture.v2,v:3,items:[]});
      const opened = await sessions.unlock(name); assert(opened.ok);
      const results = await Promise.all(['one','two'].map(id => sessions.mutate(name,opened.value.token,{kind:'upsert-record',record:createRecord(id,id)},null)));
      assert(results.filter(r=>r.ok).length === 1 && results.filter(r=>r.code === 'Stale').length === 1);
      assert((await lib.get(name)).box.rev === 5 && sessions.get(name).payloads.length === 1);
    });
    await check('forged legacy title provenance cannot enter a new record', async () => {
      const {name,source,sessions} = await setup({...fixture.v2,v:3,items:[]});
      const opened = await sessions.unlock(name); assert(opened.ok);
      const forged = {...createRecord('new','  '),legacyUntitled:true};
      assert((await sessions.mutate(name,opened.value.token,{kind:'upsert-record',record:forged},null)).code === 'Invalid');
      assert((await lib.get(name)).sourceText === source.text);
    });
    await check('lock aborts a pending session storage transaction without publishing a record', async () => {
      const {name,source,sessions} = await setup({...fixture.v2,v:3,items:[]});
      const opened = await sessions.unlock(name); assert(opened.ok);
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(...args) { const request=put.apply(this,args); sessions.lock(name); return request; };
      let result;
      try { result = await sessions.mutate(name,opened.value.token,{kind:'upsert-record',record:createRecord('new','New')},null); }
      finally { IDBObjectStore.prototype.put=put; }
      assert(!result.ok && sessions.get(name) === null && (await lib.get(name)).sourceText === source.text);
    });
    for (const name of names) { const saved = await lib.get(name); if(saved) await lib.compareAndSwap(name,saved.sourceText,null,new AbortController().signal); }
    return results;
  })()`);
  for (const [passed, name] of results) ok(passed, name);
};
