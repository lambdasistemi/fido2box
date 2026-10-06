// The library of boxes kept in this browser (IndexedDB). Boxes are locked files: this holds nothing readable.
const LIB_DB = 'recover-box', LIB_STORE = 'boxes';
function libOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(LIB_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(LIB_STORE, { keyPath: 'name' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function libTx(mode, f) {
  const db = await libOpen();
  return new Promise((res, rej) => {
    const t = db.transaction(LIB_STORE, mode); const req = f(t.objectStore(LIB_STORE));
    t.oncomplete = () => { db.close(); res(req.result); }; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
const lib = {
  list: async () => (await libTx('readonly', (s) => s.getAll())).sort((a, b) => a.name.localeCompare(b.name)),
  get: (name) => libTx('readonly', (s) => s.get(name)),
  put: (name, box) => libTx('readwrite', (s) => s.put({ name, box, savedAt: Date.now() })),
  del: (name) => libTx('readwrite', (s) => s.delete(name)),
};
