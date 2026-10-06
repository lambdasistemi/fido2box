# Audit notes

Status: **not independently reviewed.** These notes exist to make a review quick.

## What it must guarantee

1. Without an enrolled key (and its PIN), the public file reveals no title, address or secret.
2. A modified file is rejected, not silently accepted.
3. Only `https://` addresses (and `http://localhost` for rehearsal) can be opened.
4. Secrets are not shown on the page and leave it only through the clipboard, which is cleared after 60 seconds.

Each one has a test in `test/` (see the names there).

## Primitives (all built into the browser; nothing custom)

| Need | Used |
|---|---|
| Random bytes | `crypto.getRandomValues` |
| Encrypt/authenticate | AES-256-GCM, 96-bit random IV per encryption |
| Turn a key's secret into a wrapping key | HKDF-SHA-256 (zero salt, fixed info string) |
| A secret only the hardware key can recompute | WebAuthn PRF extension (CTAP hmac-secret), fixed salt `recovery-v1` |

There is no password-based key derivation and no hand-written cipher.

## Where to read (about 30 lines)

All in `web/box.js`, section "core crypto":

- `wrapKey(prf)`: key-derivation step from the key's secret.
- `wrapDataKey` / `unwrapDataKey`: locks the data key per hardware key.
- `encryptItem` / `decryptItem`: locks one `{title, url, secret}`.
- `safeUrl`: the only gate for what `Open` may navigate to.

Browser part: `prfFor` (ask the key) and `createCredential` (enrol). `userVerification: 'required'`, so the key demands its PIN.

## Known limits and questions for a reviewer

- **No associated data (AAD)** in the AES-GCM calls. Items and wrapped keys are not bound to their position or to the file. An attacker who can rewrite the file can reorder or drop items (not read or forge them).
- **Constant PRF salt** and **zero HKDF salt**: acceptable because the PRF output is already a per-credential secret, but worth a second opinion.
- **One data key for all items**, with random 96-bit IVs: fine for a handful of items, not a design for thousands.
- **Trust in the server at use time.** No Subresource Integrity (the code is one origin), no Content-Security-Policy is shipped. Serving the pages with `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'` is a sensible hardening (the pages use inline scripts).
- **No key revocation** (see README).
- **Clipboard**: any other program able to read the clipboard during the minute sees the secret.
- **Browser and key bugs** (PRF support varies) are outside this code.

## Reproduce the checks

    npm install && npm test

10 unit checks of the crypto with simulated keys and 22 end-to-end checks of the real pages. The real key's prompt is the one thing they cannot exercise.
