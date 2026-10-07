// @ts-check
// Everything that talks to a hardware key through the browser (WebAuthn). No cryptography lives here: the secret number
// that a key returns (its PRF output) is handed to crypto.js. Every request asks for the PIN (user verification) and times out after a minute.
import { addKeyEntry, keysOf, unb64, b64, unwrapDataKey, enc, dec } from './crypto.js';

/** @typedef {import('./crypto.js').Box} Box */

/**
 * A credential belongs to one website name (its rpId). Default: the host serving the page.
 * A <meta name="rp-id" content="example.org"> pins it, so www.example.org and example.org share keys.
 */
export const RP = /** @type {string} */ ((document.querySelector('meta[name="rp-id"]') instanceof HTMLMetaElement ? document.querySelector('meta[name="rp-id"]')?.getAttribute('content') : '') || location.hostname);
const SALT = enc.encode('recovery-v1');
const ALGS = /** @type {PublicKeyCredentialParameters[]} */ ([{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }]);
const rand = (/** @type {number} */ n) => crypto.getRandomValues(new Uint8Array(n));
/** @param {unknown} e @returns {string} */
const why = (e) => { const x = /** @type {{ name?: string, message?: string }} */ (e || {}); return (x.name || 'error') + (x.message ? ' (' + x.message + ')' : ''); };
/** @param {string} name @param {string} message */
const failure = (name, message) => Object.assign(new Error(message), { name });

/**
 * The secret number of one key for one credential: its PRF output with our fixed salt. The key must have verified the user.
 * @param {BufferSource} credId
 * @returns {Promise<ArrayBuffer>}
 */
export async function prfFor(credId) {
  const a = /** @type {PublicKeyCredential | null} */ (await navigator.credentials.get({ publicKey: {
    challenge: rand(32), rpId: RP, allowCredentials: [{ type: 'public-key', id: credId }], userVerification: 'required', timeout: 60000,
    extensions: /** @type {any} */ ({ prf: { eval: { first: SALT } } }) } }));
  if (!a) throw failure('NoPrf', 'no answer');
  const flags = new Uint8Array(/** @type {AuthenticatorAssertionResponse} */ (a.response).authenticatorData)[32];
  if (!(flags & 0x04)) throw failure('NoUV', 'the key did not verify the user');
  const r = /** @type {any} */ (a.getClientExtensionResults()).prf;
  if (!r || !r.results || !r.results.first) throw failure('NoPrf', 'the key has no PRF');
  return r.results.first;
}
/** Make a credential on a key not already known here. @param {string} name @param {string[]} excluded @returns {Promise<ArrayBuffer>} its id */
async function createCredential(name, excluded) {
  const cred = /** @type {PublicKeyCredential | null} */ (await navigator.credentials.create({ publicKey: {
    rp: { name: 'Recover box', id: RP }, timeout: 60000, user: { id: rand(16), name, displayName: name }, challenge: rand(32), pubKeyCredParams: ALGS,
    excludeCredentials: excluded.map((id) => ({ type: /** @type {'public-key'} */ ('public-key'), id: unb64(id) })),
    authenticatorSelection: { residentKey: 'discouraged', userVerification: 'required' }, extensions: /** @type {any} */ ({ prf: {} }) } }));
  if (!cred) throw failure('NoPrf', 'no answer');
  const ext = /** @type {any} */ (cred.getClientExtensionResults());
  if (!ext.prf || !ext.prf.enabled) throw failure('NoPrf', 'the key has no PRF');
  return cred.rawId;
}
/**
 * Open a box with any enrolled key that answers (PIN and touch): the data key.
 * @param {Box} box @returns {Promise<ArrayBuffer>}
 */
export async function unlockVault(box) {
  /** @type {unknown} */ let last = null;
  for (const e of keysOf(box)) {
    try { return await unwrapDataKey(e, await prfFor(unb64(e.id))); } catch (x) { last = x; }
  }
  throw last || new Error('no enrolled key answered');
}
/**
 * Enrol the key that is plugged in: make its credential (PIN, touch), read its secret number (PIN, touch), lock the data key with it.
 * @param {Box} box @param {string} name @param {BufferSource} data @param {string[]} [excluded] @returns {Promise<Box>}
 */
export async function enrolKey(box, name, data, excluded = []) {
  const id = await createCredential(name, [...new Set([...excluded, ...keysOf(box).map((k) => k.id)])]);
  return addKeyEntry(box, name, id, await prfFor(id), data);
}

/** Reuse a recognized credential, requiring its key again before wrapping this box's data key.
 * @param {Box} box @param {{id: string, name: string}} key @param {BufferSource} data @returns {Promise<Box>}
 */
export async function enrolKnownKey(box, key, data) {
  if (keysOf(box).some((k) => k.id === key.id)) throw new Error('That key is already in this box.');
  const id = unb64(key.id).buffer;
  return addKeyEntry(box, key.name, id, await prfFor(id), data);
}

/**
 * Which of the listed credentials is on the plugged-in key: the id that answered (a signature is requested, nothing is derived).
 * @param {string[]} ids base64 credential ids @returns {Promise<string>}
 */
export async function detectKey(ids) {
  try {
    const a = /** @type {PublicKeyCredential | null} */ (await navigator.credentials.get({ publicKey: { challenge: rand(32), rpId: RP, userVerification: 'discouraged', timeout: 60000,
      allowCredentials: ids.map((id) => ({ type: /** @type {'public-key'} */ ('public-key'), id: unb64(id) })) } }));
    if (!a) throw failure('NotAllowedError', 'no answer');
    return b64(a.rawId);
  } catch (e) { throw Object.assign(new Error('Detect failed: ' + why(e)), { original: /** @type {{ name?: string }} */ (e).name }); }
}
/**
 * Check that the plugged-in key works, with no box needed: make a throwaway credential (not kept by the key) and report what it can do.
 * It cannot say WHICH of your keys it is: only a credential made earlier can do that.
 * @returns {Promise<{ answered: boolean, prf: boolean, pin: boolean | null, transports: string[] }>}
 */
export async function probeKey() {
  /** @type {PublicKeyCredential | null} */ let cred;
  try {
    cred = /** @type {PublicKeyCredential | null} */ (await navigator.credentials.create({ publicKey: { rp: { name: 'Recover box', id: RP }, timeout: 60000,
      user: { id: rand(16), name: 'key-test', displayName: 'key test' }, challenge: rand(32), pubKeyCredParams: ALGS,
      authenticatorSelection: { residentKey: 'discouraged', userVerification: 'required' }, extensions: /** @type {any} */ ({ prf: {} }) } }));
  } catch (e) { throw new Error('Key test failed: ' + why(e)); }
  if (!cred) throw new Error('Key test failed: no answer');
  const ext = /** @type {any} */ (cred.getClientExtensionResults()), resp = /** @type {AuthenticatorAttestationResponse} */ (cred.response);
  const ad = resp.getAuthenticatorData ? new Uint8Array(resp.getAuthenticatorData()) : null;
  return { answered: true, prf: !!(ext.prf && ext.prf.enabled), pin: ad ? !!(ad[32] & 0x04) : null, transports: resp.getTransports ? resp.getTransports() : [] };
}
/**
 * A name written on the key itself: a discoverable credential whose user handle is the name. Only this site can read it back.
 * Writing the same name again replaces it; a different name is stored next to it. Needs the key's PIN, and one of its free slots.
 * @param {string} label
 */
export async function writeLabel(label) {
  const id = enc.encode(label || '');
  if (!id.length || id.length > 64) throw new Error('A label is 1 to 64 characters.');
  try {
    await navigator.credentials.create({ publicKey: { rp: { name: 'Recover box', id: RP }, timeout: 60000, user: { id, name: label, displayName: label },
      challenge: rand(32), pubKeyCredParams: ALGS, authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' } } });
  } catch (e) { throw Object.assign(new Error('Writing the label failed: ' + why(e)), { original: /** @type {{ name?: string }} */ (e).name }); }
}
/** The name written on the plugged-in key ('' when it has none). @returns {Promise<string>} */
export async function readLabel() {
  /** @type {PublicKeyCredential | null} */ let a;
  try { a = /** @type {PublicKeyCredential | null} */ (await navigator.credentials.get({ publicKey: { challenge: rand(32), rpId: RP, userVerification: 'required', timeout: 60000 } })); }
  catch (e) { throw Object.assign(new Error('Reading the label failed: ' + why(e)), { original: /** @type {{ name?: string }} */ (e).name }); }
  const h = a ? /** @type {AuthenticatorAssertionResponse} */ (a.response).userHandle : null;
  return h && h.byteLength ? dec.decode(h) : '';
}
