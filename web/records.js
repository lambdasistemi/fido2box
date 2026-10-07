// Pure recovery records and immutable editor drafts. No browser effects.
/** @typedef {'text'|'multiline'|'url'} FieldKind */
/** @typedef {{id:string, name:string, kind:FieldKind, hidden:boolean, value:string}} Field */
/** @typedef {{format:'fido2box-record', version:1, type:'recovery', id:string, title:string, legacyUntitled?:true, fields:readonly Field[]}} RecoveryRecord */
/** @typedef {{code:string, fieldId?:string}} ValidationIssue */
/** @template T @typedef {{ok:true,value:T}|{ok:false,code:string}} Result */
/** @typedef {{fieldId:string,value:string}} Confirmation */
/** @typedef {{original:RecoveryRecord,candidate:RecoveryRecord,removed:readonly Field[],order:readonly string[],confirmations:readonly Confirmation[]}} RecordDraft */
/** @typedef {{kind:'title',value:string}|{kind:'add',field:Field}|{kind:'update',fieldId:string,patch:Partial<Omit<Field,'id'>>}|{kind:'remove'|'undo',fieldId:string}|{kind:'confirmation',fieldId:string,value:string|null}} DraftChange */
/** @typedef {'Account'|'Password or recovery key'|'Website'|'Backup codes'|'Notes'} SuggestionName */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const object = value => typeof value === 'object' && value !== null && !Array.isArray(value);
/** @param {Record<string, unknown>} value @param {string[]} allowed */
const known = (value, allowed) => Object.keys(value).every(key => allowed.includes(key));
/** @param {unknown} value @returns {value is string} */
const nonblank = value => typeof value === 'string' && value.trim().length > 0;
/** @template T @param {T} value @returns {T} */
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
/** @template T @param {T} value @returns {T} */
const snapshot = value => freeze(structuredClone(value));

/** @param {string} id @param {string} title @returns {RecoveryRecord} */
export function createRecord(id, title) {
  return freeze({ format: 'fido2box-record', version: 1, type: 'recovery', id, title, fields: [] });
}

/** @param {SuggestionName} suggestion @param {string} id @returns {Field} */
export function suggestField(suggestion, id) {
  /** @type {Record<SuggestionName, [FieldKind, boolean]>} */
  const defaults = { Account: ['text', false], 'Password or recovery key': ['text', true], Website: ['url', false], 'Backup codes': ['multiline', true], Notes: ['multiline', false] };
  if (!Object.hasOwn(defaults, suggestion)) throw new Error('Invalid suggestion');
  const [kind, hidden] = defaults[suggestion];
  return freeze({ id, name: suggestion, kind, hidden, value: '' });
}

/** @param {unknown} record @returns {readonly ValidationIssue[]} */
export function validateRecord(record) {
  if (!object(record) || !known(record, ['format', 'version', 'type', 'id', 'title', 'legacyUntitled', 'fields']) ||
      record.format !== 'fido2box-record' || record.version !== 1 || record.type !== 'recovery' ||
      typeof record.id !== 'string' || !record.id || typeof record.title !== 'string' || !Array.isArray(record.fields)) return [{ code: 'InvalidRecord' }];
  /** @type {ValidationIssue[]} */
  const issues = [];
  const legacy = Object.hasOwn(record, 'legacyUntitled');
  if (record.title === 'github-token') issues.push({ code: 'ReservedTitle' });
  if (legacy ? record.legacyUntitled !== true || nonblank(record.title) : !nonblank(record.title)) issues.push({ code: 'InvalidTitle' });
  const ids = new Set();
  for (const field of record.fields) {
    if (!object(field) || !known(field, ['id', 'name', 'kind', 'hidden', 'value']) ||
        typeof field.id !== 'string' || !field.id || typeof field.name !== 'string' ||
        typeof field.kind !== 'string' || !['text', 'multiline', 'url'].includes(field.kind) ||
        typeof field.hidden !== 'boolean' || typeof field.value !== 'string') {
      issues.push({ code: 'InvalidField' });
      continue;
    }
    if (!nonblank(field.name)) issues.push({ code: 'InvalidFieldName', fieldId: field.id });
    if (ids.has(field.id)) issues.push({ code: 'DuplicateFieldId', fieldId: field.id });
    ids.add(field.id);
  }
  return issues;
}

/** @param {RecoveryRecord} record @returns {RecordDraft} */
export function beginDraft(record) {
  const original = snapshot(record);
  return freeze({ original, candidate: original, removed: [], order: record.fields.map(field => field.id), confirmations: [] });
}

/** @param {RecordDraft} draft @param {DraftChange} change @returns {RecordDraft} */
export function changeDraft(draft, change) {
  let candidate = draft.candidate, removed = [...draft.removed], order = [...draft.order], confirmations = [...draft.confirmations];
  const fields = [...candidate.fields];
  if (change.kind === 'title') {
    if (typeof change.value !== 'string') throw new Error('Invalid title change');
    candidate = { ...candidate, title: change.value };
    if (change.value !== draft.original.title || !draft.original.legacyUntitled) delete candidate.legacyUntitled;
  } else if (change.kind === 'add') {
    if (!change.field || typeof change.field.id !== 'string' || !change.field.id || order.includes(change.field.id)) throw new Error('Invalid new field');
    fields.push(snapshot(change.field)); order.push(change.field.id);
    candidate = { ...candidate, fields };
  } else if (change.kind === 'undo') {
    const field = removed.find(item => item.id === change.fieldId);
    if (!field) throw new Error('Invalid undo');
    fields.push(field); fields.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    removed = removed.filter(item => item.id !== field.id);
    candidate = { ...candidate, fields };
  } else {
    const index = fields.findIndex(field => field.id === change.fieldId);
    if (index < 0) throw new Error('Invalid field identity');
    if (change.kind === 'update') {
      if (!object(change.patch) || !known(change.patch, ['name', 'kind', 'hidden', 'value'])) throw new Error('Invalid field change');
      fields[index] = { ...fields[index], ...snapshot(change.patch) };
      candidate = { ...candidate, fields };
    } else if (change.kind === 'remove') {
      removed.push(fields[index]); fields.splice(index, 1);
      confirmations = confirmations.filter(entry => entry.fieldId !== change.fieldId);
      candidate = { ...candidate, fields };
    } else if (change.kind === 'confirmation') {
      if (change.value !== null && typeof change.value !== 'string') throw new Error('Invalid confirmation');
      confirmations = confirmations.filter(entry => entry.fieldId !== change.fieldId);
      if (change.value !== null) confirmations.push({ fieldId: change.fieldId, value: change.value });
    } else throw new Error('Invalid draft change');
  }
  return freeze({ original: draft.original, candidate, removed, order, confirmations });
}

/** @param {RecordDraft} draft @returns {readonly ValidationIssue[]} */
export function validateDraft(draft) {
  const issues = [...validateRecord(draft.candidate)];
  if (draft.candidate.legacyUntitled && (!draft.original.legacyUntitled || draft.candidate.title !== draft.original.title)) issues.push({ code: 'InvalidTitle' });
  for (const entry of draft.confirmations) {
    if (draft.candidate.fields.find(field => field.id === entry.fieldId)?.value !== entry.value) issues.push({ code: 'ConfirmationMismatch', fieldId: entry.fieldId });
  }
  return issues;
}

/** @param {RecordDraft} draft @returns {Result<RecoveryRecord>} */
export function finishDraft(draft) {
  return validateDraft(draft).length ? { ok: false, code: 'Invalid' } : { ok: true, value: snapshot(draft.candidate) };
}
