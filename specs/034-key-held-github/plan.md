# Plan key-held GitHub access

Implement the recovery story in [the specification](spec.md), with module
ownership fixed before data and function contracts. Existing Records Lean
semantics and box-session generation/CAS rules remain unchanged. Delivery is
solo; independent model-reader and audit claims are unavailable in that mode.

## Module ownership and dependencies

| Owner                      | Responsibility                                                                                   | Dependencies                           |
| -------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------- |
| `key-access-codec.js`      | Validate and encode one bounded repository/token payload and its versioned encrypted envelope    | Pure values; shared repository syntax  |
| `key-access.js`            | Discover, provision and update an access credential; require UV/PRF/storage and read back writes | Codec, crypto primitives, WebAuthn API |
| `github-access-session.js` | Connection generations and setup/read/cancel outcomes; publish only verified current results     | Injected key and GitHub ports          |
| `github-access-view.js`    | Visible first-use connection/setup controls and masked transient form                            | Literal DOM helper and session actions |
| `app.js`                   | Compose connection UI with existing library/sync/key picker; preserve old recovery               | New owners plus existing box sessions  |
| `github.js`                | Fixed-origin transport with cancellation before writes                                           | Existing transport/format primitives   |

## Data model

- Access plaintext: strict versioned object with repository `owner/name` and
  nonempty token. Unknown members/versions are refused; malformed input never
  becomes a network destination. Tokens only go to `api.github.com`.
- Stored envelope: type/version plus AES-GCM IV and ciphertext. Use a PRF input
  distinct from the existing box-wrapping input. Do not persist the PRF output.
- Discoverable access credential: public typed user-handle prefix plus random
  identity, no token/repository secret. Random identities prevent a failed new
  setup from replacing an existing credential. Credential names identify the
  access purpose in the chooser; labels retain their existing separate role.
- Update reference: verified access credential ID; update cannot target a label
  or unrecognized profile. Readback must equal the requested access payload.
- Connection state: generation, busy/refusal state and a verified optional key
  reference. Effective tokens remain in page memory. Late completions never
  restore a disconnected or superseded connection.

## Function and interaction contracts

- `readAccess(signal)` discovers with no allow-list, validates credential type,
  UV, PRF and stored envelope, and returns access plus its credential reference.
- `saveAccess(access, signal, reference)` creates a fresh credential when no
  reference is supplied, or updates the verified reference. Returns success only
  after authenticated decryption of the exact read-back payload.
- The session exposes connect, save, cancel/disconnect and a secret-free view.
  GitHub authorization is checked before provisioning, and before recovered
  access becomes the displayed connection. Failed network authentication can
  retain only a verified key reference for token renewal.
- UI setup is available before a box exists; new saves use key storage. Legacy
  service tokens stay readable, removable and usable for existing sessions.
- Network operations capture repository, token and connection generation.
  Cancellation/supersession prevents late local publication or a not-yet-sent
  write. An already accepted remote write cannot be undone by disconnecting.

## Decisions and verification

| Choice                                           | Alternative rejected                                  | Evidence required                                                                            |
| ------------------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Key-held access independent of boxes             | Token in the box needed to fetch itself               | Full UI setup, browser-store wipe, discover, fetch and enrolled-key unlock                   |
| Discoverable credential plus encrypted largeBlob | Browser credential-ID cache; token in userHandle/name | No allow-list recovery; inspected ciphertext and public metadata; missing capability refusal |
| Verify writes by reading the selected credential | Treat create/written flags as sufficient              | Missing/corrupt/readback-failed controls; no connection published on failure                 |
| Preserve existing box cryptography               | Rewrite boxes just to change GitHub login             | Frozen fixtures, all existing record/session/browser tests                                   |
| Cancel stale connection work                     | Global mutable token read after awaits                | Deferred key and fetch results, connection switch during Pull/Push                           |

The empty-library behavioral RED preceded implementation. Authenticator failure
controls were added with the implementation, not executed against prior stubs;
do not describe those controls as test-first evidence. Tests run through
existing unit/browser entrypoints, strict checkJs, Just/Nix gates and site
smoke. Documentation will carry the recovery flow diagram and the exact
device/portability limits. Any new abstract connection proof is explicitly
separate from browser/hardware conformance; no broad formal-design acceptance
follows from this solo fix.
