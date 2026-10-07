// WebCrypto primitives only: HKDF-SHA-256 wrapping and AES-256-GCM with fresh IVs.
// No record interpretation, persistence, networking or browser presentation.
/** @typedef {import('./box-format.js').KeyEntry} KeyEntry */
/** @typedef {import('./box-format.js').Sealed} Sealed */
export const enc = new TextEncoder(), dec = new TextDecoder();

/** @param {ArrayBuffer | Uint8Array} buf */
export const b64 = (buf) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(u.subarray(i, i + 0x8000))); return btoa(s); };
/** @param {string} s */
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));


/**
 * The AES key that wraps the data key for one hardware key: HKDF-SHA-256 of that key's secret number (32 bytes, uniform),
 * zero salt, fixed info string. Not extractable.
 * @param {BufferSource} prf
 */
async function wrapKey(prf) {
  const base = await crypto.subtle.importKey('raw', prf, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: enc.encode('recovery-wrap-v1') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
/** A fresh random data key (32 bytes). */
export const newDataKey = () => crypto.getRandomValues(new Uint8Array(32));
/**
 * @param {BufferSource} data
 * @param {KeyUsage[]} usage
 */
const aesKey = (data, usage) => crypto.subtle.importKey('raw', data, 'AES-GCM', false, usage);

/**
 * Lock the data key for one hardware key: AES-GCM under that key's wrap key, with a fresh random 96-bit IV.
 * @param {BufferSource} data  the data key
 * @param {BufferSource} prf   the hardware key's secret number
 */
export async function wrapDataKey(data, prf) {
  const wiv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wiv }, await wrapKey(prf), data);
  return { wrapIv: b64(wiv), wrapped: b64(wrapped) };
}
/**
 * Recover the data key from one entry. Throws if the secret number is not the one this entry was made with.
 * @param {KeyEntry} entry
 * @param {BufferSource} prf
 * @returns {Promise<ArrayBuffer>}
 */
export async function unwrapDataKey(entry, prf) {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(entry.wrapIv) }, await wrapKey(prf), unb64(entry.wrapped));
}

/** Encrypt exact text without interpreting a record schema. @param {BufferSource} data @param {string} text @returns {Promise<Sealed>} */
export async function encryptText(data, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(data, ['encrypt']), enc.encode(text));
  return { iv: b64(iv), ct: b64(ct) };
}
/** Decrypt authenticated text without interpreting its schema. @param {BufferSource} data @param {Sealed} it @returns {Promise<string>} */
export async function decryptText(data, it) {
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(it.iv) }, await aesKey(data, ['decrypt']), unb64(it.ct)));
}
