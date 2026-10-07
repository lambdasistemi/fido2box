// Versioned, bounded key-held GitHub access. Never include values in errors.
import { enc, dec, unb64 } from './crypto.js';
export const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
export const ACCESS_PREFIX = 'fido2box:github:v1:';
/** @typedef {{repo:string,token:string}} Access */
/** @param {unknown} x @param {string[]} keys */
const exact = (x, keys) => !!x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).sort().join(',') === keys.sort().join(',');
const invalid = () => new Error('Unsupported or damaged GitHub access on this key. Set up a new profile or select another key.');
/** @param {Access} access */
export function encodeAccess(access) {
  if (!REPO_RE.test(access.repo) || access.repo.length > 200 || !access.token || access.token.length > 512 || /[\s\x00-\x1f\x7f]/.test(access.token)) throw new Error('Enter owner/repository and a GitHub token without whitespace.');
  return JSON.stringify({v:1,repo:access.repo,token:access.token});
}
/** @param {string} text @returns {Access} */
export function decodeAccess(text) {
  try { const x = JSON.parse(text); if (!exact(x,['v','repo','token']) || x.v !== 1 || typeof x.repo !== 'string' || typeof x.token !== 'string') throw invalid(); encodeAccess(x); return {repo:x.repo,token:x.token}; } catch { throw invalid(); }
}
/** @param {import('./box-format.js').Sealed} sealed */
export const encodeEnvelope = sealed => enc.encode(JSON.stringify({v:1,...sealed}));
/** @param {ArrayBuffer} blob @returns {import('./box-format.js').Sealed} */
export function decodeEnvelope(blob) {
  try {
    if (blob.byteLength > 4096) throw invalid();
    const x = JSON.parse(dec.decode(blob));
    if (!exact(x,['v','iv','ct']) || x.v !== 1 || typeof x.iv !== 'string' || typeof x.ct !== 'string' || unb64(x.iv).length !== 12 || unb64(x.ct).length < 16) throw invalid();
    return {iv:x.iv,ct:x.ct};
  } catch { throw invalid(); }
}
/** @param {ArrayBuffer|null} handle */
export const isAccessHandle = handle => !!handle && dec.decode(handle).startsWith(ACCESS_PREFIX);
