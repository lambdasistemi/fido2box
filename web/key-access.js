// Hardware storage is independent of every box and browser store.
import { RP } from './webauthn.js';
import { enc, b64, unb64, encryptText, decryptText } from './crypto.js';
import { ACCESS_PREFIX, isAccessHandle, encodeAccess, decodeAccess, encodeEnvelope, decodeEnvelope } from './key-access-codec.js';
/** @typedef {import('./key-access-codec.js').Access} Access */
/** @typedef {{id:string}} Reference */
/** @typedef {'create'|'derive'|'write'|'verify'} Stage */
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
// Ciphertext alone is not access: only saveAccess has the operation-local,
// UV-verified PRF needed to authenticate this readback. Normal reads use readAccess.
/** @param {AbortSignal} signal @param {string} id */
async function readCiphertext(signal,id) {
  signal.throwIfAborted();
  const a=/** @type {PublicKeyCredential|null} */(await navigator.credentials.get({signal,publicKey:{rpId:RP,challenge:random(),timeout:60000,
    allowCredentials:[{type:'public-key',id:unb64(id)}],userVerification:'discouraged',
    extensions:/** @type {any} */({largeBlob:{read:true}})}}));
  signal.throwIfAborted();
  if(!a || b64(a.rawId)!==id || !(new Uint8Array(/** @type {AuthenticatorAssertionResponse} */(a.response).authenticatorData)[32]&1)) throw new Error('Ciphertext readback did not confirm the selected key and touch.');
  const blob=/** @type {{largeBlob?:{blob?:ArrayBuffer}}} */(a.getClientExtensionResults()).largeBlob?.blob;
  if(!blob)throw new Error('No ciphertext was read back.');
  return blob;
}
/** @param {Access} access @param {AbortSignal} signal @param {Reference} [reference] @param {(stage:Stage)=>void} [progress] */
export async function saveAccess(access,signal,reference,progress=()=>{}) {
  const text = encodeAccess(access);
  let id = reference?.id;
  /** @type {BufferSource|undefined} */ let prf;
  if (!id) {
    signal.throwIfAborted();
    progress('create');
    const c = /** @type {PublicKeyCredential|null} */(await navigator.credentials.create({signal,publicKey:{rp:{id:RP,name:'fido2box'},
      user:{id:enc.encode(ACCESS_PREFIX+crypto.randomUUID()),name:'GitHub access: '+access.repo,displayName:'GitHub access: '+access.repo},
      challenge:random(),pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],timeout:60000,
      authenticatorSelection:{authenticatorAttachment:'cross-platform',residentKey:'required',requireResidentKey:true,userVerification:'required'},
      extensions:/** @type {any} */({prf:{eval:{first:salt}},largeBlob:{support:'required'}})}}));
    signal.throwIfAborted();
    const ext = /** @type {any} */(c?.getClientExtensionResults());
    if (!c || !ext?.prf?.enabled || !ext?.largeBlob?.supported) throw new Error('This browser/key cannot store GitHub access: discoverable credentials, PRF and largeBlob are required.');
    const response=/** @type {AuthenticatorAttestationResponse} */(c.response);
    const authData=response.getAuthenticatorData?.();
    if(authData && !(new Uint8Array(authData)[32]&4)) throw new Error('The key did not verify your PIN.');
    const early=ext.prf.results?.first;
    if(early!==undefined && (!(early instanceof ArrayBuffer)&&!ArrayBuffer.isView(early)||early.byteLength!==32)) throw new Error('The key returned an invalid PRF encryption result.');
    // Creation-time evaluation is optional. Never use it without verified UV,
    // and do not retain this encryption secret beyond the current save.
    if(authData && early)prf=early;
    id = b64(c.rawId);
  }
  if(!prf){progress('derive');prf=(await assertion(signal,id)).prf;}
  const blob = encodeEnvelope(await encryptText(prf,text));
  progress('write');
  const written = await assertion(signal,id,blob);
  if (written.written !== true) throw new Error('The key did not confirm the write. GitHub access is not verified; check storage support or free space.');
  try {
    progress('verify');
    const blob=await readCiphertext(signal,id);
    // The write assertion already supplied a fresh PRF with verified UV.
    // Reusing it also checks that it decrypts what the earlier PRF encrypted.
    const checked=decodeAccess(await decryptText(written.prf,decodeEnvelope(blob)));
    signal.throwIfAborted();
    if (encodeAccess(checked) !== text) throw new Error('mismatch');
    return {access:checked,reference:{id}};
  } catch { signal.throwIfAborted(); throw new Error('The key reported a write, but readback could not verify it. Connect with the key to check before relying on it.'); }
}
