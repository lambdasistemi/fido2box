module.exports = async ({ run, ok }) => {
  const results = await run(`(async () => {
    const { lib, backups } = await import('./store.js');
    const results = [];
    const check = async (name, test) => { try { await test(); results.push([true, name]); } catch (e) { results.push([false, name + ': ' + e.message]); } };
    const assert = (value) => { if (!value) throw Error('Unexpected storage result'); };
    const source = text => ({ text, value: JSON.parse(text) });
    const initial = source(' { "v": 99, "opaque": "original" }\\n');
    const next = source('{"v":99,"opaque":"next"}');
    const signal = () => new AbortController().signal;
    const raw = async (write, name) => {
      const db = await new Promise((resolve, reject) => { const r = indexedDB.open('recover-box', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      return new Promise((resolve, reject) => { const tx = db.transaction('boxes', write ? 'readwrite' : 'readonly'), store = tx.objectStore('boxes'); const req = write ? store.put(write) : store.get(name); tx.oncomplete = () => { db.close(); resolve(req.result); }; tx.onabort = () => { db.close(); reject(tx.error); }; });
    };
    await check('old library reads add source identity only in memory, without rewriting storage', async () => {
      const old = { name: 'storage-old', box: { v: 2, keys: [], items: [], unknown: true }, savedAt: 123 };
      await raw(old);
      const read = await lib.get(old.name);
      assert(read.sourceText === JSON.stringify(old.box) && read.savedAt === 123);
      assert(JSON.stringify(await raw(null, old.name)) === JSON.stringify(old));
    });
    await check('atomic replacement preserves exact unknown source and compares full source, not revision', async () => {
      const saved = await lib.compareAndSwap('storage-cas', null, initial, signal()); assert(saved.ok);
      assert((await lib.get('storage-cas')).sourceText === initial.text);
      const denied = await lib.compareAndSwap('storage-cas', JSON.stringify(initial.value), next, signal());
      assert(!denied.ok && denied.code === 'Conflict');
      assert((await lib.get('storage-cas')).sourceText === initial.text);
      assert((await lib.compareAndSwap('storage-cas', initial.text, next, signal())).ok);
    });
    await check('concurrent transactions with the same predecessor admit exactly one writer', async () => {
      const name = 'storage-race';
      assert((await lib.compareAndSwap(name, null, initial, signal())).ok);
      const results = await Promise.all([lib.compareAndSwap(name, initial.text, next, signal()), lib.compareAndSwap(name, initial.text, source('{"winner":2}'), signal())]);
      assert(results.filter(r => r.ok).length === 1 && results.filter(r => r.code === 'Conflict').length === 1);
    });
    await check('aborted writes and malformed replacements leave the stored source unchanged', async () => {
      const abort = new AbortController(); abort.abort();
      await raw({ name: 'storage-cas', box: next.value, sourceText: next.text, savedAt: 0 });
      const before = await lib.get('storage-cas');
      assert(!(await lib.compareAndSwap('storage-cas', before.sourceText, initial, abort.signal)).ok);
      assert(!(await lib.compareAndSwap('storage-cas', before.sourceText, { text: '{broken', value: {} }, signal())).ok);
      assert((await lib.get('storage-cas')).sourceText === before.sourceText);
    });
    await check('backups are immutable and idempotent, survive active deletion and list globally', async () => {
      const first = await backups.retain('storage-backup', initial); assert(first.ok);
      const again = await backups.retain('storage-backup', initial); assert(again.ok && again.value.id === first.value.id);
      const different = await backups.retain('storage-backup', next); assert(different.ok && different.value.id !== first.value.id);
      assert((await backups.get(first.value.id)).sourceText === initial.text);
      assert((await lib.compareAndSwap('storage-backup', null, next, signal())).ok);
      assert((await lib.compareAndSwap('storage-backup', next.text, null, signal())).ok);
      assert((await backups.list('storage-backup')).length === 2);
      assert((await backups.list()).some(b => b.id === first.value.id));
    });
    await check('abort while a put is pending rolls back the real transaction', async () => {
      const controller = new AbortController(), put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) { const pending = put.apply(this, args); controller.abort(); return pending; };
      let result;
      try { result = await lib.compareAndSwap('storage-cas', next.text, initial, controller.signal); }
      finally { IDBObjectStore.prototype.put = put; }
      assert(!result.ok && result.code === 'Stale');
      assert((await lib.get('storage-cas')).sourceText === next.text);
    });
    await check('quota failure preserves the predecessor and reports storage failure', async () => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () { throw new DOMException('synthetic quota', 'QuotaExceededError'); };
      let result;
      try { result = await lib.compareAndSwap('storage-cas', next.text, initial, signal()); }
      finally { IDBObjectStore.prototype.put = put; }
      assert(!result.ok && result.code === 'StorageFailed');
      assert((await lib.get('storage-cas')).sourceText === next.text);
    });
    await check('backup add failure is contained without an uncaught browser exception', async () => {
      const add = IDBObjectStore.prototype.add;
      let uncaught = 0;
      const onerror = event => { uncaught++; event.preventDefault(); };
      window.addEventListener('error', onerror);
      IDBObjectStore.prototype.add = function () { throw new DOMException('synthetic quota', 'QuotaExceededError'); };
      let result;
      try { result = await backups.retain('storage-failed-backup', initial); }
      finally { IDBObjectStore.prototype.add = add; window.removeEventListener('error', onerror); }
      assert(!result.ok && result.code === 'BackupFailed' && uncaught === 0);
      assert((await backups.list('storage-failed-backup')).length === 0);
    });
    // These synthetic entries must not affect the existing app scenarios.
    for (const name of ['storage-old', 'storage-cas', 'storage-race']) {
      const record = await lib.get(name);
      if (record && lib.compareAndSwap) await lib.compareAndSwap(name, record.sourceText, null, signal()).catch(() => {});
      const db = await new Promise(resolve => { const r = indexedDB.open('recover-box', 1); r.onsuccess = () => resolve(r.result); });
      await new Promise(resolve => { const tx = db.transaction('boxes', 'readwrite'); tx.objectStore('boxes').delete(name); tx.oncomplete = () => { db.close(); resolve(); }; });
    }
    return results;
  })()`);
  for (const [passed, name] of results) ok(passed, name);
};
