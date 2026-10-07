// Owns private keys, generation fences, migration permission and guarded writes.
import { inspectBox, keysOf, emptyVault, buildBox, sourceFromBox, readSource } from './box-format.js';
import { decodeRecord, encodeRecord } from './record-codec.js';
import { newDataKey, encryptText, decryptText } from './crypto.js';
/** @typedef {import('./box-format.js').Box} Box */
/** @typedef {import('./box-format.js').SourceDocument} SourceDocument */
/** @typedef {import('./record-codec.js').Payload} Payload */
/** @typedef {import('./store.js').StoredBox} StoredBox */
/** @template T @typedef {import('./records.js').Result<T>} Result */
/** @typedef {{name:string,generation:number,sourceIdentity:string}} SessionToken */
/** @typedef {{token:SessionToken,payloads:readonly Payload[],writable:boolean,code:string,version:1|2|3}} SessionView */
/** @typedef {{sourceIdentity:string,backupId:string}} MigrationApproval */
/** @typedef {{kind:'upsert-record',record:import('./records.js').RecoveryRecord}|{kind:'delete-record',recordId:string}|{kind:'set-token',id:string,url:string,secret:string}|{kind:'remove-token',id:string}|{kind:'add-key',name:string,enrol?:(data:BufferSource)=>Promise<import('./box-format.js').KeyEntry>}|{kind:'remove-key',credentialId:string}} BoxMutation */
/** @typedef {{storage:typeof import('./store.js').lib,backups:typeof import('./store.js').backups,newId:()=>string,rpId:string,unlock:(box:Box)=>Promise<ArrayBuffer>,enrol:(name:string,data:BufferSource)=>Promise<import('./box-format.js').KeyEntry>}} BoxSessionPorts */
/** @typedef {{data:BufferSource,box:Box,source:SourceDocument,view:SessionView}} PrivateSession */
/** @typedef {{generation:number,abort:AbortController,session:PrivateSession|null,queue:Promise<unknown>}} Slot */
/** @param {string} code @returns {{ok:false,code:string}} */
const failure = code => ({ok:false,code});

/** @param {BoxSessionPorts} ports */
export function createBoxSessions(ports) {
  /** @type {Map<string,Slot>} */ const slots = new Map();
  /** @param {string} name */
  function slot(name) {
    let value = slots.get(name);
    if (!value) { value = {generation:0,abort:new AbortController(),session:null,queue:Promise.resolve()}; slots.set(name,value); }
    return value;
  }
  /** @param {string} name */
  function lock(name) {
    const state = slot(name); state.generation++; state.session = null;
    state.abort.abort(); state.abort = new AbortController();
  }
  /** @param {string} name @param {number} generation */
  const current = (name, generation) => slot(name).generation === generation;
  /** @param {string} name @param {SessionToken} token */
  const bound = (name, token) => slot(name).session?.view.token === token;
  /** Clone plaintext for callers; keep the unforgeable token identity. @param {SessionView} value @returns {SessionView} */
  const publicView = value => ({...value,payloads:structuredClone(value.payloads)});
  /** @param {string} name @param {number} generation @param {SourceDocument} source @param {Box} box @param {BufferSource} data @param {readonly Payload[]} payloads @param {boolean} writable @param {string} code */
  function publish(name,generation,source,box,data,payloads,writable,code) {
    const token = Object.freeze({name,generation,sourceIdentity:source.text});
    const view = {token,payloads:structuredClone(payloads),writable,code,version:box.v};
    slot(name).session = {data,source,box,view};
    return publicView(view);
  }
  /** @param {string} name @returns {SessionView|null} */
  function get(name) { const view = slot(name).session?.view; return view ? publicView(view) : null; }
  /** @param {string} name @returns {Promise<Result<SessionView>>} */
  async function unlock(name) {
    lock(name); const generation = slot(name).generation;
    try {
      const stored = await ports.storage.get(name);
      if (!current(name,generation)) return failure('Stale');
      if (!stored) return failure('Invalid');
      const source = readSource(stored.sourceText);
      if (!source.ok) return source;
      const inspection = inspectBox(source.value.value), box = inspection.box;
      if (!box) return failure(inspection.code);
      const data = await ports.unlock(box);
      if (!current(name,generation)) return failure('Stale');
      const sealed = box.v === 1 ? [{iv:box.iv,ct:box.ct}] : box.items;
      /** @type {Payload[]} */ const payloads = [];
      let writable = inspection.writable, code = inspection.code;
      const ids = new Set();
      for (const item of sealed) {
        const text = await decryptText(data,item);
        if (!current(name,generation)) return failure('Stale');
        const decoded = decodeRecord(text,box.v,box.v === 3 ? [] : [ports.newId(),ports.newId(),ports.newId()]);
        if (decoded.status !== 'ok') { writable = false; code = decoded.code; continue; }
        if (ids.has(decoded.payload.id)) { writable = false; code = 'Invalid'; }
        ids.add(decoded.payload.id); payloads.push(decoded.payload);
      }
      const latest = await ports.storage.get(name);
      if (!current(name,generation)) return failure('Stale');
      if (latest?.sourceText !== stored.sourceText) return failure('Conflict');
      return {ok:true,value:publish(name,generation,source.value,box,data,payloads,writable,code)};
    } catch { return failure(current(name,generation) ? 'AuthFailed' : 'Stale'); }
  }
  /** @param {string} name @param {string} keyName @param {string} rpId @returns {Promise<Result<SessionView>>} */
  async function create(name,keyName,rpId) {
    lock(name); const state = slot(name), generation = state.generation, signal = state.abort.signal;
    try {
      const data = newDataKey(), key = await ports.enrol(keyName,data);
      if (!current(name,generation)) return failure('Stale');
      const box = {...emptyVault(rpId),keys:[key]};
      if (!inspectBox(box).writable) return failure('Invalid');
      const source = sourceFromBox(box), saved = await ports.storage.compareAndSwap(name,null,source,signal);
      if (!saved.ok) return saved;
      if (!current(name,generation)) return failure('Stale');
      return {ok:true,value:publish(name,generation,source,box,data,[],true,'')};
    } catch { return failure(current(name,generation) ? 'AuthFailed' : 'Stale'); }
  }
  /** @param {string} name @param {SessionToken} token @param {boolean} approved @returns {Promise<Result<MigrationApproval>>} */
  async function prepareMigration(name,token,approved) {
    if (!bound(name,token)) return failure('Stale');
    const session = slot(name).session;
    if (!session?.view.writable) return failure('Unsupported');
    if (!approved) return failure('MigrationRequired');
    try {
      const backup = await ports.backups.retain(name,session.source);
      if (!bound(name,token)) return failure('Stale');
      if (!backup.ok) return failure('BackupFailed');
      const verified = await ports.backups.get(backup.value.id);
      if (!bound(name,token)) return failure('Stale');
      if (verified?.name !== name || verified.sourceText !== session.source.text || verified.sourceIdentity !== session.source.text) return failure('BackupFailed');
      return {ok:true,value:{sourceIdentity:session.source.text,backupId:verified.id}};
    } catch { return failure('BackupFailed'); }
  }
  /** @param {string} name @param {SessionToken} token @param {BoxMutation} mutation @param {MigrationApproval|null} approval @returns {Promise<Result<SessionView>>} */
  function mutate(name,token,mutation,approval) {
    // Capture the request before queueing; callers cannot change it during awaits.
    const request = mutation.kind === 'add-key' ? {...mutation} : structuredClone(mutation);
    const permission = approval ? {...approval} : null;
    const state = slot(name);
    const pending = state.queue.then(() => commit(name,token,request,permission));
    state.queue = pending.catch(() => {});
    return pending;
  }
  /** @param {string} name @param {SessionToken} token @param {BoxMutation} mutation @param {MigrationApproval|null} approval @returns {Promise<Result<SessionView>>} */
  async function commit(name,token,mutation,approval) {
    if (!bound(name,token)) return failure('Stale');
    const state = slot(name), session = state.session;
    if (!session) return failure('Locked');
    if (!session.view.writable) return failure('Unsupported');
    const signal = state.abort.signal;
    try {
      if (session.box.v !== 3) {
        if (!approval || approval.sourceIdentity !== session.source.text) return failure('MigrationRequired');
        const backup = await ports.backups.get(approval.backupId);
        if (!bound(name,token)) return failure('Stale');
        if (backup?.name !== name || backup.sourceIdentity !== session.source.text || backup.sourceText !== session.source.text) return failure('BackupFailed');
      }
      let payloads = [...session.view.payloads], keys = [...keysOf(session.box)];
      if (mutation.kind === 'upsert-record') {
        const old = payloads.find(p => p.id === mutation.record.id), record = mutation.record;
        if (old && old.type !== 'recovery') return failure('Invalid');
        if (record.legacyUntitled && (!old || old.type !== 'recovery' || !old.legacyUntitled || old.title !== record.title)) return failure('Invalid');
        if (!encodeRecord(record).ok) return failure('Invalid');
        payloads = old ? payloads.map(p => p.id === record.id ? record : p) : [...payloads,record];
      } else if (mutation.kind === 'delete-record') {
        if (!payloads.some(p => p.type === 'recovery' && p.id === mutation.recordId)) return failure('Invalid');
        payloads = payloads.filter(p => p.id !== mutation.recordId);
      } else if (mutation.kind === 'set-token') {
        const old = payloads.find(p => p.id === mutation.id);
        if (old && old.type !== 'github-token') return failure('Invalid');
        /** @type {Payload} */ const service = {format:'fido2box-record',version:1,type:'github-token',title:'github-token',id:mutation.id,url:mutation.url,secret:mutation.secret};
        payloads = old ? payloads.map(p => p.id === mutation.id ? service : p) : [...payloads,service];
      } else if (mutation.kind === 'remove-token') {
        if (!payloads.some(p => p.type === 'github-token' && p.id === mutation.id)) return failure('Invalid');
        payloads = payloads.filter(p => p.id !== mutation.id);
      } else if (mutation.kind === 'add-key') {
        keys.push(await (mutation.enrol ? mutation.enrol(session.data) : ports.enrol(mutation.name,session.data)));
        if (!bound(name,token)) return failure('Stale');
      } else if (mutation.kind === 'remove-key') {
        if (!keys.some(k => k.id === mutation.credentialId) || keys.length < 2) return failure('Invalid');
        keys = keys.filter(k => k.id !== mutation.credentialId);
      } else return failure('Invalid');
      const items = [];
      for (const payload of payloads) {
        const encoded = encodeRecord(payload); if (!encoded.ok) return encoded;
        items.push(await encryptText(session.data,encoded.value));
        if (!bound(name,token)) return failure('Stale');
      }
      const candidate = buildBox(session.box,items,keys,ports.rpId);
      if (!candidate.ok) return candidate;
      if (!bound(name,token)) return failure('Stale');
      const source = sourceFromBox(candidate.value);
      const saved = await ports.storage.compareAndSwap(name,session.source.text,source,signal);
      if (!saved.ok) { if (saved.code === 'Conflict' && bound(name,token)) lock(name); return saved; }
      if (!bound(name,token)) return failure('Stale');
      return {ok:true,value:publish(name,token.generation,source,candidate.value,session.data,payloads,true,'')};
    } catch { return failure(bound(name,token) ? 'StorageFailed' : 'Stale'); }
  }
  /** @param {string} name @param {string|null} expected @param {SourceDocument} next @returns {Promise<Result<StoredBox>>} */
  async function replace(name,expected,next) {
    lock(name); const state = slot(name), generation = state.generation;
    try {
      const saved = await ports.storage.compareAndSwap(name,expected,next,state.abort.signal);
      if (!current(name,generation)) return failure('Stale');
      return saved.ok ? saved.value ? {ok:true,value:saved.value} : failure('StorageFailed') : saved;
    } catch { return failure('StorageFailed'); }
  }
  /** @param {string} name @param {string} expected @returns {Promise<Result<void>>} */
  async function remove(name,expected) {
    lock(name);
    try { const saved = await ports.storage.compareAndSwap(name,expected,null,slot(name).abort.signal); return saved.ok ? {ok:true,value:undefined} : saved; }
    catch { return failure('StorageFailed'); }
  }
  return {create,unlock,get,prepareMigration,mutate,replace,remove,lock};
}
