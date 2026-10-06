// @ts-check
// The library of boxes kept in this browser (IndexedDB). Boxes are locked files: this holds nothing readable.

/** @typedef {import('./crypto.js').Box} Box */
/** @typedef {{ name: string, box: Box, savedAt: number }} Record */

const LIB_DB = 'recover-box', LIB_STORE = 'boxes';
/** @returns {Promise<IDBDatabase>} */
function libOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(LIB_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(LIB_STORE, { keyPath: 'name' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
/**
 * @template T
 * @param {IDBTransactionMode} mode @param {(s: IDBObjectStore) => IDBRequest<T>} f @returns {Promise<T>}
 */
async function libTx(mode, f) {
  const db = await libOpen();
  return new Promise((res, rej) => {
    const t = db.transaction(LIB_STORE, mode), req = f(t.objectStore(LIB_STORE));
    t.oncomplete = () => { db.close(); res(req.result); }; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
export const lib = {
  /** @returns {Promise<Record[]>} */ list: async () => (/** @type {Record[]} */ (await libTx('readonly', (s) => s.getAll()))).sort((a, b) => a.name.localeCompare(b.name)),
  /** @param {string} name @returns {Promise<Record | undefined>} */ get: (name) => libTx('readonly', (s) => s.get(name)),
  /** @param {string} name @param {Box} box */ put: (name, box) => libTx('readwrite', (s) => s.put({ name, box, savedAt: Date.now() })),
  /** @param {string} name */ del: (name) => libTx('readwrite', (s) => s.delete(name)),
};
