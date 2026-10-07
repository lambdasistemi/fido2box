# Audit notes

Status: **not independently reviewed.** These notes exist to make a review quick.

## What it must guarantee

1. Without an enrolled key (and its PIN), the public file reveals no title, address or secret.
2. A modified file is rejected, not silently accepted.
3. Only `https://` addresses (and `http://localhost` for rehearsal) can be opened.
4. Secrets are not shown on the page. They leave it only through the clipboard. The app tries to clear the clipboard after 60 seconds, but only when the clipboard still holds that secret and the page can reach it; browsers refuse clipboard access to a page that is not focused, so the clear can fail (the app says so). Clear it yourself when in doubt.

Each one has a test in `test/` (see the names there).

## Primitives (all built into the browser; nothing custom)

| Need | Used |
|---|---|
| Random bytes | `crypto.getRandomValues` |
| Encrypt/authenticate | AES-256-GCM, 96-bit random IV per encryption |
| Turn a key's secret into a wrapping key | HKDF-SHA-256 (zero salt, fixed info string) |
| A secret only the hardware key can recompute | WebAuthn PRF extension (CTAP hmac-secret), fixed salt `recovery-v1` |

There is no password-based key derivation and no hand-written cipher.
## Audit map: what to read, and what is out of scope

The code is plain ES modules served as they are (no build). Each file below has `// @ts-check` and JSDoc types, checked in CI by `tsc --noEmit`. Read them in this order:

| File | Lines | Trusts | What it is |
|---|---|---|---|
| `web/crypto.js` | about 130 | WebCrypto only | **The whole construction and the box format.** No page, network or key: a key's secret number is an argument. `wrapKey`, `wrapDataKey`, `unwrapDataKey`, `encryptItem`, `decryptItem`, `parseItem`, `listItems`. Read this first and most carefully. |
| `web/webauthn.js` | about 115 | the browser's WebAuthn | Everything that talks to a key: ask for the secret number (`prfFor`), enrol (`enrolKey`), detect, test, label. Always `userVerification: 'required'` for the secret number; the user-verified flag is checked. |
| `web/url.js` | 10 | | `safeUrl`: the only gate for what Open may navigate to. |
| `web/github.js` | about 65 | api.github.com | List, read and write `boxes/NAME.json`. The token is only sent there. Refuses to overwrite a version with the same or a higher `rev`. |
| `web/store.js` | 30 | IndexedDB | The library of locked boxes in the browser. |
| `web/guidance.js` | about 160 | DOM and localStorage | Static documentation, contextual help dialogs, and the inline-help preference. Does not read box data or credentials and makes no network requests. |
| `web/app.js` | about 270 | all of the above | The interface and its state. **Not type-checked.** It holds the unlocked data key and the plaintext items in memory (`S.unlocked`) while a box is open, handles the clipboard and the token. |

Out of scope: the browser, the operating system, the hardware key's firmware, GitHub, the domain and its DNS.

## Known limits and questions for a reviewer

- **No associated data (AAD)** in the AES-GCM calls. Items and wrapped keys are not bound to their position or to the file. An attacker who can rewrite the file can reorder or drop items (not read or forge them).
- **Constant PRF salt** and **zero HKDF salt**: acceptable because the PRF output is already a per-credential secret, but worth a second opinion.
- **One data key for all items**, with random 96-bit IVs: fine for a handful of items, not a design for thousands.
- **Trust in the server at use time.** No Subresource Integrity (the code is one origin). A Content-Security-Policy is set by a meta tag (scripts and styles only from the page's own origin, connections only to api.github.com, no framing control because a meta tag cannot set it). Any page served from the same host can still ask your key for the unlock secret, so serve the app from a host that serves nothing else.
- **No key revocation** (see README).
- **Clipboard**: any other program able to read the clipboard during the minute sees the secret.
- **Browser and key bugs** (PRF support varies) are outside this code.

## Reproduce the checks

    npm install && npx tsc -p tsconfig.json && npm test

Unit checks of the crypto and the GitHub helpers with simulated keys, and checks that drive the real app in headless Chrome with a virtual security key (WebAuthn with PRF), IndexedDB and a fake GitHub. The real key's prompt and the real GitHub are the things they cannot exercise.
