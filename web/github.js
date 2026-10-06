// @ts-check
// The box repository on GitHub: boxes/NAME.json, one file per box, through the contents API. The token is only ever sent to api.github.com.
import { b64, unb64, enc, dec } from './crypto.js';

/** @typedef {import('./crypto.js').Box} Box */
/** @typedef {(url: string, init?: RequestInit) => Promise<{ status: number, ok: boolean, json: () => Promise<any> }>} Fetch  injectable, for tests */

/** What a box may be called: letters, digits, - and _ (up to 40). */
export const NAME_RE = /^[A-Za-z0-9_-]{1,40}$/;
/** @param {string} token */
const ghHeaders = (token) => ({ Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
/** @param {number} status */
const ghName = (status) => (status === 401 || status === 403 ? 'BadToken' : status === 404 ? 'NoRepo' : (status === 409 || status === 422) ? 'Conflict' : 'GitHubError');
/** @param {number} status */
const ghFail = (status) => Object.assign(new Error('github ' + status), { name: ghName(status) });
const API = 'https://api.github.com/repos/';

/**
 * Names of the boxes in the repository (an empty list when the folder does not exist yet).
 * @param {string} repo owner/name @param {string} token @param {Fetch} [f] @returns {Promise<string[]>}
 */
export async function listRemote(repo, token, f) {
  const get = f || fetch;
  const r = await get(API + repo + '/contents/boxes', { headers: ghHeaders(token), cache: 'no-store' });
  if (r.status === 404) { const root = await get(API + repo, { headers: ghHeaders(token), cache: 'no-store' }); if (root.status === 200) return []; throw ghFail(404); }
  if (r.status !== 200) throw ghFail(r.status);
  /** @type {{ type: string, name: string }[]} */ const entries = await r.json();
  return entries.filter((e) => e.type === 'file' && /\.json$/.test(e.name) && NAME_RE.test(e.name.replace(/\.json$/, ''))).map((e) => e.name.replace(/\.json$/, ''));
}
/**
 * The box called `name`, parsed, or null when it is not there.
 * @param {string} repo @param {string} token @param {string} name @param {Fetch} [f] @returns {Promise<Box | null>}
 */
export async function fetchRemote(repo, token, name, f) {
  const get = f || fetch;
  const r = await get(API + repo + '/contents/boxes/' + name + '.json', { headers: ghHeaders(token), cache: 'no-store' });
  if (r.status === 404) return null;
  if (r.status !== 200) throw ghFail(r.status);
  const cur = await r.json();
  return JSON.parse(dec.decode(unb64(String(cur.content).replace(/\s/g, ''))));
}
/**
 * Write `path` (default box.json) in `repo` with one commit. Refuses to replace a box whose rev is the same or higher.
 * @param {string} repo @param {string} token @param {string} text the file @param {number} rev
 * @param {Fetch} [f] @param {string} [path]
 * @returns {Promise<string>} the commit sha, or 'unchanged'
 */
export async function saveToGitHub(repo, token, text, rev, f, path) {
  const get = f || fetch;
  const url = API + repo + '/contents/' + (path || 'box.json'), h = ghHeaders(token);
  /** @param {string} name @param {string} msg @param {object} [extra] */
  const fail = (name, msg, extra) => Object.assign(new Error(msg), { name }, extra);
  const g = await get(url, { headers: h, cache: 'no-store' });
  /** @type {string | undefined} */ let sha;
  if (g.status === 200) {
    const cur = await g.json(); sha = cur.sha;
    let remoteText = '', remote = null;
    try { remoteText = dec.decode(unb64(String(cur.content).replace(/\s/g, ''))); remote = JSON.parse(remoteText); } catch (e) { /* unreadable remote: compared as text below */ }
    if (remoteText === text) return 'unchanged';
    if (remote && (remote.rev || 0) >= rev) throw fail('RemoteNewer', 'newer', { rev: remote.rev || 0 });
  } else if (g.status !== 404) throw fail(g.status === 401 || g.status === 403 ? 'BadToken' : 'GitHubError', 'github ' + g.status);
  const p = await get(url, { method: 'PUT', headers: { ...h, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'box rev ' + rev, content: b64(enc.encode(text)), ...(sha ? { sha } : {}) }) });
  if (!p.ok) throw fail(ghName(p.status), 'github ' + p.status);
  return (await p.json()).commit.sha;
}
