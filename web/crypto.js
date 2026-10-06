// @ts-check
// The box: keep secrets behind hardware keys. This file is the whole cryptographic construction and the box file format.
// It uses only WebCrypto (HKDF-SHA-256, AES-256-GCM) and touches no page, no network and no key: the secret number of a
// hardware key (its WebAuthn PRF output) is an argument. Everything here is covered by test/box.test.js.
//
// A box is a public JSON file:
//   keys:  one entry per enrolled hardware key. Each wraps the same random "data key" with a secret only that key can recompute.
//   items: each is {iv, ct}: an AES-256-GCM box of {title, url, secret} under the data key. Titles are inside the lock.
// One enrolled key opens every item. There is no associated data: an item is not bound to its position or to its box.

/**
 * @typedef {{ title: string, url: string, secret: string }} Item
 * @typedef {{ name: string, id: string, wrapIv: string, wrapped: string }} KeyEntry   base64 strings; id = the credential id
 * @typedef {{ iv: string, ct: string }} Sealed
 * @typedef {{ v: number, rev?: number, rpId?: string, keys?: KeyEntry[], entries?: KeyEntry[], items?: Sealed[], iv?: string, ct?: string }} Box
 */

export const enc = new TextEncoder(), dec = new TextDecoder();

/** @param {ArrayBuffer | Uint8Array} buf */
export const b64 = (buf) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(u.subarray(i, i + 0x8000))); return btoa(s); };
/** @param {string} s */
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** The item that holds the GitHub token inside a box (it is hidden from the list of things you use). */
export const TOKEN_TITLE = 'github-token';
const SECRET_KEY_RE = /A3-[A-Z0-9]{6}(-[A-Z0-9]{5,6}){5}/;

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

/** @param {Box} box @returns {KeyEntry[]} */
export const keysOf = (box) => box.keys || box.entries || [];   // version 1 files called them "entries"

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

/**
 * Lock one item under the data key with a fresh random 96-bit IV.
 * @param {BufferSource} data
 * @param {Item} item
 * @returns {Promise<Sealed>}
 */
export async function encryptItem(data, item) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(data, ['encrypt']), enc.encode(JSON.stringify({ title: item.title, url: item.url, secret: item.secret })));
  return { iv: b64(iv), ct: b64(ct) };
}
/**
 * @param {BufferSource} data
 * @param {Sealed} it
 * @returns {Promise<Item>}
 */
export async function decryptItem(data, it) {
  const text = dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(it.iv) }, await aesKey(data, ['decrypt']), unb64(it.ct)));
  return parseItem(text);
}
/** An item's plaintext is JSON; older boxes held plain text (perhaps a 1Password Secret Key). @param {string} text @returns {Item} */
export function parseItem(text) {
  try {
    const o = JSON.parse(text);
    if (o && typeof o.secret === 'string') return { title: typeof o.title === 'string' ? o.title : '', url: typeof o.url === 'string' ? o.url : '', secret: o.secret };
  } catch (e) { /* not JSON: fall through to the plain-text case */ }
  const m = text.match(SECRET_KEY_RE);
  return { title: 'Secret', url: '', secret: m ? m[0] : text };
}
/**
 * Every item of a box, decrypted. Version 1 boxes held a single note.
 * @param {Box} box
 * @param {BufferSource} data
 * @returns {Promise<Item[]>}
 */
export async function listItems(box, data) {
  if (box.v === 1) return [await decryptItem(data, { iv: String(box.iv), ct: String(box.ct) })];
  return Promise.all((box.items || []).map((it) => decryptItem(data, it)));
}

/** A new empty box for the site `rpId`. `rev` goes up by one on every saved edit. @param {string} rpId @returns {Box} */
export const emptyVault = (rpId) => ({ v: 2, rev: 0, rpId, keys: [], items: [] });
/**
 * Add one hardware key to a box: its credential id and the data key locked with its secret number.
 * @param {Box} box @param {string} name @param {ArrayBuffer} credId @param {BufferSource} prf @param {BufferSource} data
 * @returns {Promise<Box>}
 */
export async function addKeyEntry(box, name, credId, prf, data) {
  return { ...box, keys: [...keysOf(box), { name, id: b64(credId), ...(await wrapDataKey(data, prf)) }] };
}
/** @param {Box} box @param {BufferSource} data @param {Item} item @returns {Promise<Box>} */
export async function addItem(box, data, item) {
  return { ...box, items: [...(box.items || []), await encryptItem(data, item)] };
}
/** Turn a version 1 box (one note) into version 2 with the same data key and keys. @param {Box} box @param {BufferSource} data @returns {Promise<Box>} */
export async function upgrade(box, data) {
  if (box.v !== 1) return box;
  const [first] = await listItems(box, data);
  return { v: 2, rpId: box.rpId, keys: keysOf(box), items: [await encryptItem(data, first)] };
}
