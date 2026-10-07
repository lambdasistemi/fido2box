// Hardware storage is independent of every box and browser store.
import { RP } from './webauthn.js';
import { enc, b64, unb64, encryptText, decryptText } from './crypto.js';
import { ACCESS_PREFIX, isAccessHandle, encodeAccess, decodeAccess, encodeEnvelope, decodeEnvelope } from './key-access-codec.js';
/** @typedef {import('./key-access-codec.js').Access} Access */
/** @typedef {{id:string}} Reference */
const random = () => crypto.getRandomValues(new Uint8Array(32));
const salt = enc.encode('fido2box-github-access-v1');
/** @param {AbortSignal} signal @param {string} [id] @param {Uint8Array} [write] */
async function assertion(signal,id,write) {
  signal.throwIfAborted();
  const a = /** @type {PublicKeyCredential|null} */(await navigator.credentials.get({signal,publicKey:{rpId:RP,challenge:random(),timeout:60000,userVerification:'required',
    ...(id ? {allowCredentials:[{type:/** @type {'public-key'} */('public-key'),id:unb64(id)}]} : {}),
    extensions:/** @type {any} */({prf:{eval:{first:salt}},largeBlob:write ? {write} : {read:true}})}}));
  signal.throwIfAborted();
  if (!a) throw new Error('No key answered. Select your GitHub access credential or set up the key first.');
  const response = /** @type {AuthenticatorAssertionResponse} */(a.response);
  if (!(new Uint8Array(response.authenticatorData)[32] & 4)) throw new Error('The key did not verify your PIN.');
  if (!id && !isAccessHandle(response.userHandle)) throw new Error('That credential is not GitHub access. Select the GitHub access credential, or set up this key.');
  const ext = /** @type {{prf?:{results?:{first?:ArrayBuffer}},largeBlob?:{blob?:ArrayBuffer,written?:boolean}}} */(a.getClientExtensionResults());
  const prf = ext.prf?.results?.first;
  if (!prf || prf.byteLength !== 32) throw new Error('This browser or key does not supply PRF encryption for GitHub access.');
  return {id:b64(a.rawId),prf,blob:ext.largeBlob?.blob,written:ext.largeBlob?.written};
}
/** @param {AbortSignal} signal @param {Reference} [reference] */
export async function readAccess(signal,reference) {
  const a = await assertion(signal,reference?.id);
  if (!a.blob) throw new Error('No GitHub access data was read. This key may need setup, or this browser/key may not support key storage (largeBlob).');
  let access;
  try { access = decodeAccess(await decryptText(a.prf,decodeEnvelope(a.blob))); }
  catch { throw new Error('GitHub access on this key is damaged or unsupported. Select another profile or set up a new one.'); }
  signal.throwIfAborted();
  return {access,reference:{id:a.id}};
}
/** @param {Access} access @param {AbortSignal} signal @param {Reference} [reference] */
export async function saveAccess(access,signal,reference) {
  const text = encodeAccess(access);
  let id = reference?.id;
  if (!id) {
    signal.throwIfAborted();
    const c = /** @type {PublicKeyCredential|null} */(await navigator.credentials.create({signal,publicKey:{rp:{id:RP,name:'fido2box'},
      user:{id:enc.encode(ACCESS_PREFIX+crypto.randomUUID()),name:'GitHub access: '+access.repo,displayName:'GitHub access: '+access.repo},
      challenge:random(),pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],timeout:60000,
      authenticatorSelection:{authenticatorAttachment:'cross-platform',residentKey:'required',requireResidentKey:true,userVerification:'required'},
      extensions:/** @type {any} */({prf:{},largeBlob:{support:'required'}})}}));
    signal.throwIfAborted();
    const ext = /** @type {any} */(c?.getClientExtensionResults());
    if (!c || !ext?.prf?.enabled || !ext?.largeBlob?.supported) throw new Error('This browser/key cannot store GitHub access: discoverable credentials, PRF and largeBlob are required.');
    id = b64(c.rawId);
  }
  const a = await assertion(signal,id);
  const blob = encodeEnvelope(await encryptText(a.prf,text));
  const written = await assertion(signal,id,blob);
  if (written.written !== true) throw new Error('The key did not confirm the write. GitHub access is not verified; check storage support or free space.');
  try {
    const checked = await readAccess(signal,{id});
    if (encodeAccess(checked.access) !== text) throw new Error('mismatch');
    return checked;
  } catch { signal.throwIfAborted(); throw new Error('The key reported a write, but readback could not verify it. Connect with the key to check before relying on it.'); }
}
