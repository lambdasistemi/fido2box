// Encrypted sources only. Reads never rewrite old wrappers or migrate a box.
import { readSource } from './box-format.js';
/** @typedef {import('./box-format.js').SourceDocument} SourceDocument */
/** @typedef {{name:string,box:unknown,savedAt:number,sourceText:string}} StoredBox */
/** @typedef {{id:string,name:string,createdAt:number,sourceIdentity:string,sourceText:string}} Backup */
/** @template T @typedef {import('./records.js').Result<T>} Result */
const LIB = 'boxes', BACKUPS = 'snapshots';
/** @param {string} store @returns {Promise<IDBDatabase>} */
function open(store) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(store === LIB ? 'recover-box' : 'recover-box-backups', 1);
    request.onupgradeneeded = () => {
      const created = request.result.createObjectStore(store, { keyPath: store === LIB ? 'name' : 'id' });
      if (store === BACKUPS) created.createIndex('identity', ['name', 'sourceIdentity'], { unique: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
/** @template T @param {string} store @param {IDBTransactionMode} mode @param {(s:IDBObjectStore)=>IDBRequest<T>} operation @returns {Promise<T>} */
async function request(store, mode, operation) {
  const db = await open(store);
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(store, mode), result = operation(tx.objectStore(store));
      tx.oncomplete = () => { db.close(); resolve(result.result); };
      tx.onabort = () => { db.close(); reject(new Error('StorageFailed')); };
    } catch { db.close(); reject(new Error('StorageFailed')); }
  });
}
/** @param {Omit<StoredBox,'sourceText'> & {sourceText?:string}} stored @returns {StoredBox} */
function normalize(stored) {
  const sourceText = stored.sourceText ?? JSON.stringify(stored.box);
  return { ...stored, sourceText, box: JSON.parse(sourceText) };
}

export const lib = {
  /** @returns {Promise<StoredBox[]>} */
  async list() { return (await request(LIB, 'readonly', s => s.getAll())).map(normalize).sort((a, b) => a.name.localeCompare(b.name)); },
  /** @param {string} name @returns {Promise<StoredBox|undefined>} */
  async get(name) { const stored = await request(LIB, 'readonly', s => s.get(name)); return stored ? normalize(stored) : undefined; },
  /** @param {string} name @param {string|null} expected @param {SourceDocument|null} next @param {AbortSignal} signal @returns {Promise<Result<StoredBox|null>>} */
  async compareAndSwap(name, expected, next, signal) {
    const parsed = next === null ? null : readSource(next.text);
    if (parsed && !parsed.ok) return { ok: false, code: 'Invalid' };
    if (signal.aborted) return { ok: false, code: 'Stale' };
    try {
      const db = await open(LIB);
      return await new Promise(resolve => {
        const tx = db.transaction(LIB, 'readwrite'), store = tx.objectStore(LIB);
        /** @type {Result<StoredBox|null>} */ let result = { ok: false, code: 'StorageFailed' };
        const abort = () => { try { tx.abort(); } catch { /* Already committed; completion decides the result. */ } };
        const finish = (/** @type {Result<StoredBox|null>} */ value) => { signal.removeEventListener('abort', abort); db.close(); resolve(value); };
        tx.oncomplete = () => finish(result);
        tx.onabort = () => finish({ ok: false, code: signal.aborted ? 'Stale' : 'StorageFailed' });
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) { abort(); return; }
        const get = store.get(name);
        get.onsuccess = () => {
          try {
            const current = get.result ? normalize(get.result).sourceText : null;
            if (current !== expected) { result = { ok: false, code: 'Conflict' }; return; }
            if (signal.aborted) { abort(); return; }
            const value = parsed?.ok ? { name, sourceText: parsed.value.text, box: parsed.value.value, savedAt: Date.now() } : null;
            if (value) store.put(value); else store.delete(name);
            result = { ok: true, value };
          } catch { abort(); }
        };
      });
    } catch { return { ok: false, code: 'StorageFailed' }; }
  },
};

export const backups = {
  /** @param {string} name @param {SourceDocument} source @returns {Promise<Result<Backup>>} */
  async retain(name, source) {
    if (!readSource(source.text).ok) return { ok: false, code: 'BackupFailed' };
    try {
      const db = await open(BACKUPS);
      const saved = await new Promise((resolve, reject) => {
        const tx = db.transaction(BACKUPS, 'readwrite'), store = tx.objectStore(BACKUPS);
        /** @type {Backup} */ let value;
        const get = store.index('identity').get([name, source.text]);
        get.onsuccess = () => {
          try {
            value = get.result || { id: crypto.randomUUID(), name, createdAt: Date.now(), sourceIdentity: source.text, sourceText: source.text };
            if (!get.result) store.add(value);
          } catch { tx.abort(); }
        };
        tx.oncomplete = () => { db.close(); resolve(value); };
        tx.onabort = () => { db.close(); reject(new Error('BackupFailed')); };
      });
      const verified = await backups.get(saved.id);
      return verified?.name === name && verified.sourceIdentity === source.text && verified.sourceText === source.text
        ? { ok: true, value: verified } : { ok: false, code: 'BackupFailed' };
    } catch { return { ok: false, code: 'BackupFailed' }; }
  },
  /** @param {string} id @returns {Promise<Backup|undefined>} */
  get: id => request(BACKUPS, 'readonly', s => s.get(id)),
  /** @param {string} [name] @returns {Promise<Backup[]>} */
  async list(name) { return (await request(BACKUPS, 'readonly', s => s.getAll())).filter(b => name === undefined || b.name === name); },
};
