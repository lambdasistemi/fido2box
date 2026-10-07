// Pure plaintext interpretation. Encryption and ID generation belong to callers.
import { createRecord, validateRecord } from './records.js';

/** @typedef {import('./records.js').RecoveryRecord} RecoveryRecord */
/** @typedef {import('./records.js').Field} Field */
/** @typedef {{format:'fido2box-record',version:1,type:'github-token',id:string,title:'github-token',url:string,secret:string}} ServiceRecord */
/** @typedef {RecoveryRecord|ServiceRecord} Payload */
/** @typedef {{status:'ok',payload:Payload}|{status:'unsupported'|'invalid',code:string}} DecodeResult */
/** @typedef {'Invalid'|'Unsupported'} FormatError */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const object = value => typeof value === 'object' && value !== null && !Array.isArray(value);
/** @param {Record<string, unknown>} value @param {string[]} allowed */
const unknownMember = (value, allowed) => Object.keys(value).some(key => !allowed.includes(key));

/** @param {unknown} value @returns {FormatError|null} */
function payloadError(value) {
  if (!object(value)) return 'Invalid';
  const service = value.type === 'github-token';
  if (unknownMember(value, service
    ? ['format', 'version', 'type', 'id', 'title', 'url', 'secret']
    : ['format', 'version', 'type', 'id', 'title', 'legacyUntitled', 'fields'])) return 'Unsupported';
  if (typeof value.format !== 'string' || typeof value.version !== 'number' || typeof value.type !== 'string') return 'Invalid';
  if (value.format !== 'fido2box-record' || value.version !== 1 || !['recovery', 'github-token'].includes(value.type)) return 'Unsupported';
  if (service) {
    return typeof value.id === 'string' && value.id.length > 0 && value.title === 'github-token' &&
      typeof value.url === 'string' && typeof value.secret === 'string' ? null : 'Invalid';
  }
  if (Array.isArray(value.fields)) {
    for (const field of value.fields) {
      if (!object(field)) continue;
      if (unknownMember(field, ['id', 'name', 'kind', 'hidden', 'value']) ||
          (typeof field.kind === 'string' && !['text', 'multiline', 'url'].includes(field.kind))) return 'Unsupported';
    }
  }
  return validateRecord(value).length ? 'Invalid' : null;
}

/** @param {FormatError} code @returns {DecodeResult} */
const failure = code => ({ status: code === 'Unsupported' ? 'unsupported' : 'invalid', code });

/** @param {string} text @param {1|2|3} outerVersion @param {readonly string[]} ids @returns {DecodeResult} */
export function decodeRecord(text, outerVersion, ids) {
  if (![1, 2, 3].includes(outerVersion)) return failure('Unsupported');
  if (typeof text !== 'string' || !Array.isArray(ids) ||
      (outerVersion === 3 ? ids.length !== 0 : ids.length !== 3 || new Set(ids).size !== 3 || ids.some(id => typeof id !== 'string' || !id))) return failure('Invalid');
  if (outerVersion === 1) {
    return { status: 'ok', payload: { ...createRecord(ids[0], 'Secret'), fields: [
      { id: ids[1], name: 'Notes', kind: 'multiline', hidden: true, value: text },
    ] } };
  }
  let value;
  try { value = JSON.parse(text); } catch { return failure('Invalid'); }
  if (outerVersion === 3) {
    const error = payloadError(value);
    return error ? failure(error) : { status: 'ok', payload: /** @type {Payload} */ (value) };
  }
  if (!object(value)) return failure('Invalid');
  if (unknownMember(value, ['title', 'url', 'secret'])) return failure('Unsupported');
  if (typeof value.secret !== 'string' ||
      (Object.hasOwn(value, 'title') && typeof value.title !== 'string') ||
      (Object.hasOwn(value, 'url') && typeof value.url !== 'string')) return failure('Invalid');
  const title = typeof value.title === 'string' ? value.title : '';
  if (title === 'github-token') {
    return { status: 'ok', payload: { format: 'fido2box-record', version: 1, type: 'github-token', id: ids[0], title,
      url: typeof value.url === 'string' ? value.url : '', secret: value.secret } };
  }
  /** @type {Field[]} */
  const fields = [{ id: ids[1], name: 'Secret', kind: 'text', hidden: true, value: value.secret }];
  if (typeof value.url === 'string') fields.push({ id: ids[2], name: 'Website', kind: 'url', hidden: false, value: value.url });
  return { status: 'ok', payload: { ...createRecord(ids[0], title), ...(title.trim() ? {} : { legacyUntitled: /** @type {const} */ (true) }), fields } };
}

/** @param {Payload} payload @returns {import('./records.js').Result<string>} */
export function encodeRecord(payload) {
  const code = payloadError(payload);
  return code ? { ok: false, code } : { ok: true, value: JSON.stringify(payload) };
}
