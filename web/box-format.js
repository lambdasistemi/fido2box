// Strict encrypted envelopes. Unknown source data is retained, never projected away.
/** @typedef {{name:string,id:string,wrapIv:string,wrapped:string}} KeyEntry */
/** @typedef {{iv:string,ct:string}} Sealed */
/** @typedef {{v:1,entries:readonly KeyEntry[],iv:string,ct:string,rpId?:string,rev?:number}} BoxV1 */
/** @typedef {{v:2,keys:readonly KeyEntry[],items:readonly Sealed[],rpId?:string,rev?:number}} BoxV2 */
/** @typedef {{v:3,keys:readonly KeyEntry[],items:readonly Sealed[],rpId:string,rev:number}} BoxV3 */
/** @typedef {BoxV1|BoxV2|BoxV3} Box */
/** @typedef {{text:string,value:unknown}} SourceDocument */
/** @typedef {{box:Box|null,writable:boolean,code:string}} BoxInspection */
/** @template T @typedef {import('./records.js').Result<T>} Result */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
const object = value => typeof value === 'object' && value !== null && !Array.isArray(value);
/** @param {Record<string,unknown>} value @param {string[]} names */
const extra = (value, names) => Object.keys(value).some(name => !names.includes(name));
/** @param {unknown} value @param {number} min @param {number} [exact] */
function base64(value, min, exact) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return false;
  try { const raw = atob(value); return btoa(raw) === value && raw.length >= min && (exact === undefined || raw.length === exact); } catch { return false; }
}
/** @param {unknown} value */
const sealed = value => object(value) && base64(value.iv, 12, 12) && base64(value.ct, 16);
/** @param {unknown} value */
const key = value => object(value) && typeof value.name === 'string' && base64(value.id, 1) && base64(value.wrapIv, 12, 12) && base64(value.wrapped, 48, 48);

/** @param {string} text @returns {Result<SourceDocument>} */
export function readSource(text) {
  try { return { ok: true, value: { text, value: JSON.parse(text) } }; } catch { return { ok: false, code: 'Invalid' }; }
}
/** @param {unknown} value @returns {BoxInspection} */
export function inspectBox(value) {
  const invalid = { box: null, writable: false, code: 'Invalid' };
  if (!object(value)) return invalid;
  if (![1, 2, 3].includes(/** @type {number} */ (value.v))) return { ...invalid, code: 'Unsupported' };
  const legacy = value.v === 1, current = value.v === 3;
  if ((legacy && Object.hasOwn(value, 'keys')) || (!legacy && Object.hasOwn(value, 'entries'))) return invalid;
  if ((current || Object.hasOwn(value, 'rev')) && (!Number.isSafeInteger(value.rev) || Number(value.rev) < 0)) return invalid;
  if ((current || Object.hasOwn(value, 'rpId')) && (typeof value.rpId !== 'string' || !value.rpId)) return invalid;
  const keys = legacy ? value.entries : value.keys;
  if (!Array.isArray(keys) || !keys.every(key) || new Set(keys.map(k => k.id)).size !== keys.length) return invalid;
  const items = legacy ? [value] : value.items;
  if (!Array.isArray(items) || !items.every(sealed)) return invalid;
  const unknown = extra(value, legacy ? ['v', 'entries', 'iv', 'ct', 'rev', 'rpId'] : ['v', 'keys', 'items', 'rev', 'rpId']) ||
    keys.some(k => extra(k, ['name', 'id', 'wrapIv', 'wrapped'])) || (!legacy && items.some(it => extra(it, ['iv', 'ct'])));
  return { box: /** @type {Box} */ (/** @type {unknown} */ (value)), writable: !unknown, code: unknown ? 'Unsupported' : '' };
}
/** @param {Box} box @returns {readonly KeyEntry[]} */
export function keysOf(box) {
  return box.v === 1 ? box.entries : box.v === 2 || box.v === 3 ? box.keys : [];
}
/** @param {string} rpId @returns {BoxV3} */
export const emptyVault = rpId => ({ v: 3, rev: 0, rpId, keys: [], items: [] });
/** @param {Box} source @param {readonly Sealed[]} items @param {readonly KeyEntry[]} keys @param {string} rpId @returns {Result<BoxV3>} */
export function buildBox(source, items, keys, rpId) {
  const inspected = inspectBox(source);
  if (!inspected.writable) return { ok: false, code: inspected.code };
  const value = { ...emptyVault(source.rpId || rpId), rev: (source.rev ?? 0) + 1, keys, items };
  return inspectBox(value).writable ? { ok: true, value: structuredClone(value) } : { ok: false, code: 'Invalid' };
}
/** @param {Box} box @returns {SourceDocument} */
export const sourceFromBox = box => ({ text: JSON.stringify(box, null, 2), value: structuredClone(box) });
