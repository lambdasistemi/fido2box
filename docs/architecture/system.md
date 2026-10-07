# System design

As a maintainer or reviewer, use this page to follow a recovery secret from
authenticator to browser to backup, and see where the current guarantees stop.

fido2box is a recovery kit: a static browser application, encrypted box files,
and enrolled authenticators. A person recovering an account needs the original
site identity, a compatible browser/authenticator, and a copy of the box. There
is no fido2box application server, account database, or background sync.

**Baseline:** implemented behavior at
[4d19422](https://github.com/lambdasistemi/fido2box/tree/4d19422670f0de2a51b795f5c7cd320dcb951f2a),
including identification-first key enrollment. This page describes that
implementation, not a security certification. The [design roadmap](roadmap.md)
and
[expressive-records proposal](https://github.com/lambdasistemi/fido2box/pull/29)
are separate. Proposed modules and formats are not current capabilities.

## Context and trust boundaries

<!-- diagram: system-context -->

The browser is the integration point and the place where secrets become
plaintext. The arrows describe permitted data flows, not independently secured
process boundaries inside the page.

| Participant         | Responsibility                                                                    | Trust and failure boundary                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Person and backups  | Keep the domain, box copies, and working enrolled keys available                  | Losing every copy of a box or every usable key prevents recovery. A private GitHub backup must be accessible independently of the secret it protects.          |
| App and docs origin | Serve `/` and `/docs/` from the same deployed site                                | Delivered scripts are trusted at unlock time. Docs assets share that origin. Signed manifests identify bytes; they do not prevent malicious code being served. |
| Browser and OS      | Execute WebCrypto/WebAuthn, hold unlocked state, persist files, navigate and copy | Extensions, browser compromise, OS compromise, and clipboard readers remain outside the app's protection.                                                      |
| Authenticator       | Answer a credential-scoped PRF request with user verification                     | The app checks the UV flag. Current enrollment does not enforce dedicated hardware, a PIN specifically, or non-exportability.                                  |
| GitHub              | Store versioned encrypted JSON and accept explicit Contents API writes            | Receives box metadata and ciphertext, plus the access token. The file's revision is not a trusted anti-rollback anchor.                                        |

See [security boundaries](../security.md) and the unresolved
[audit findings](https://github.com/lambdasistemi/fido2box/issues/16).

## Runtime ownership and dependency direction

<!-- diagram: runtime-owners -->

The source is served unbundled; the app uses native ES modules and a small
classic-script bootstrap. `app.js` composes domain operations, WebAuthn,
storage, networking, DOM rendering, and session state. This is the current
boundary, including its weaknesses; it is not the proposed module split.

| Owner                                                                                                                                                                      | Public operations or responsibility                                            | Depends on                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| [`crypto.js`](https://github.com/lambdasistemi/fido2box/blob/4d19422/web/crypto.js)                                                                                        | Box/item types, data keys, wrapping, encryption, legacy parsing                | WebCrypto; no DOM, network, persistence, or authenticator calls |
| [`webauthn.js`](https://github.com/lambdasistemi/fido2box/blob/4d19422/web/webauthn.js)                                                                                    | `prfFor`, unlock, new/recognized enrollment, detection, probe, hardware labels | Browser credentials API and crypto helpers                      |
| [`store.js`](https://github.com/lambdasistemi/fido2box/blob/4d19422/web/store.js)                                                                                          | `lib.list/get/put/del` for encrypted library records                           | IndexedDB; no decryption                                        |
| [`github.js`](https://github.com/lambdasistemi/fido2box/blob/4d19422/web/github.js)                                                                                        | List/fetch boxes; explicit revision-checked writes                             | Fetch to `api.github.com`; encoding helpers in crypto           |
| [`url.js`](https://github.com/lambdasistemi/fido2box/blob/4d19422/web/url.js)                                                                                              | `safeUrl` navigation policy                                                    | URL parsing; no navigation side effect                          |
| [`theme.js`](https://github.com/lambdasistemi/fido2box/blob/4d19422/web/theme.js), [`guidance.js`](https://github.com/lambdasistemi/fido2box/blob/4d19422/web/guidance.js) | Theme preferences; static guide and optional help dialogs                      | DOM, localStorage, system appearance; no box data               |
| [`app.js`](https://github.com/lambdasistemi/fido2box/blob/4d19422/web/app.js)                                                                                              | Routes, box sessions, key-name lookup, forms, clipboard, sync orchestration    | All of the above; not included in JSDoc type checking           |

The constitution calls for smaller, explicit owners as features touch these
responsibilities. Key metadata collection and the enrollment picker still live
inside `app.js`; that is a design debt to address, not an extracted module to
pretend exists. The [roadmap](roadmap.md) identifies the integration point with
PR #29's proposed session and record owners.

## Data model and lifetime

<!-- diagram: box-data -->

A local library record is `{ name, box, savedAt }` in IndexedDB database
`recover-box`, store `boxes`. Downloads and GitHub files contain the box itself;
its filename supplies the library name when imported. GitHub paths are
`boxes/NAME.json`.

The current v2 box is conceptually:

```text
Box
  v = 2, rev, rpId
  keys[]  = { name, id, wrapIv, wrapped }
  items[] = { iv, ct }

Decrypted item = { title, url, secret }
```

| Data                                                                                  | Durable location                                     | Plaintext visibility                                                                    |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Item title, URL, secret                                                               | Ciphertext in IndexedDB, downloads, and GitHub       | Unlocked page memory; user actions may navigate to the URL or copy the secret           |
| Data key                                                                              | Wrapped once per enrolled credential in each box     | Raw bytes in unlocked page memory; not stored unwrapped by the app                      |
| PRF output                                                                            | Not intentionally persisted by the app               | Browser memory during key operations                                                    |
| Box name, revision, RP ID, credential IDs, key nicknames, counts and ciphertext sizes | Public box/library metadata and repository filenames | Visible without unlocking; credential reuse correlates boxes                            |
| GitHub token inside a box                                                             | Encrypted item with reserved title `github-token`    | Available to GitHub calls when that box is unlocked; excluded from the normal item list |
| Session GitHub token                                                                  | `S.token` in page memory                             | Lost on reload; Forget removes this session token, not encrypted tokens in boxes        |
| Theme, help preference, repository selection                                          | localStorage                                         | Nonsecret browser preferences; storage failure may limit persistence                    |
| Optional hardware label                                                               | Discoverable credential on the authenticator         | Read through WebAuthn for this site; separate from box nicknames                        |

The runtime currently recognizes a token by its reserved item title rather than
an explicit service-record type. The proposed richer record model must migrate
this without exposing service tokens as ordinary user fields.

## Key and identity model

A **physical authenticator**, a **credential ID**, a **box nickname**, and an
optional **hardware label** are different concepts. The application has no
universal hardware serial-number registry. It gathers known credentials from
local and already-loaded remote box metadata, filtered to the current RP ID when
one is present. Locked boxes participate.

1. **Identify:** ask the authenticator to answer for an available credential. A
   match selects its existing nickname; cancellation or no match is
   inconclusive. Importing a missing backup may supply the necessary metadata.
2. **Enroll recognized:** request that credential's PRF again with user
   verification; wrap this box's data key and retain the credential ID/name. A
   different authenticator cannot satisfy that request merely by sharing a
   nickname. The same credential is rejected if already in this box.
3. **Enroll unregistered:** choose an optional nickname or an automatic unused
   name. Credential creation excludes all known IDs so known hardware cannot
   silently acquire a new nickname through this path. Then obtain its PRF and
   wrap the data key.
4. **Read/write a label:** a separate discoverable credential suggests a name;
   it does not establish box membership or rename existing entries.

Older boxes can contain several credentials or names for the same hardware.
These records are preserved. Different credential IDs are not proof of different
physical devices; duplicate-credential rejection is not a universal physical-key
uniqueness guarantee. Changes to the RP ID, PRF input, or wrapping parameters
must preserve recovery compatibility or provide an explicit migration.

## Cryptographic data flow

<!-- diagram: unlock-flow -->

A new box gets a random 32-byte data key. Each enrolled credential provides a
WebAuthn PRF output using input `recovery-v1`. HKDF-SHA-256, a zero salt, and
info `recovery-wrap-v1` derive an AES-256-GCM wrapping key. Each key entry wraps
the same box data key with a fresh random 96-bit IV. Each item is separately
AES-GCM encrypted with a fresh random 96-bit IV under that data key.

Unlock tries enrolled credentials, unwraps the data key, and decrypts items. The
crypto functions receive bytes; only `webauthn.js` invokes the authenticator.
Recognized enrollment can reuse a credential and therefore its wrapping key
across boxes, while newly created boxes still have independent random data keys.

Individual ciphertext authentication detects bit changes and wrong keys. The
collection, revision, metadata, and record context are not fully authenticated.
Do not infer full-file integrity or freshness from successful decryption.

## Lifecycle and synchronization

<!-- diagram: box-lifecycle -->

| Action                    | Current state transition                                               | Boundary or known gap                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Create                    | New data key and enrollment → encrypted local box plus unlocked memory | No automatic GitHub write                                                                                                  |
| Import / Pull remote-only | Encrypted file → local library                                         | Import performs only coarse validation; importing does not unlock                                                          |
| Unlock                    | Local ciphertext → `S.unlocked[name] = { data, plain }`                | Some GitHub refreshes follow unlock when a token becomes available                                                         |
| Edit / key change         | Build a v2 box, raise revision, persist, reload library                | No generation-bound session or compare-and-swap guard; editing also uses cached plaintext                                  |
| Lock / reload             | Remove a session entry / discard page memory                           | Not guaranteed memory zeroization; navigating between routes alone does not lock all boxes                                 |
| Push                      | Local encrypted box → GitHub Contents API                              | Identical text is unchanged; different content with same/higher remote revision is refused; GitHub SHA guards a write race |
| Pull existing             | Fetch remote box → replace IndexedDB and refresh metadata              | **Stale Pull:** cached unlocked plaintext/data key remain; a later edit can corrupt or overwrite the replacement           |
| Remove a key              | Remove its current wrapper                                             | **Removal is not revocation:** unchanged data key means an old wrapper can still decrypt future contents using that key    |
| Delete locally            | Remove library entry                                                   | Does not delete downloaded or GitHub copies                                                                                |

Revisions describe application edits, not authenticated history. There is no
automatic merge, background synchronization, or independent trusted freshness
service. A downloaded historical file may be valid yet outdated. Network errors
and rejected credentials must not be interpreted as successful synchronization
or proof that a physical key is new.

## Compatibility and evidence

v1 contains a single encrypted note and `entries`; v2 uses encrypted item
triples and `keys`. Legacy text parsing can extract a 1Password-style Secret
Key. The current parser projects supported item members and is not a lossless
arbitrary record codec. The v3 record model in PR #29 is proposed, not
implemented here.

| Claim                                       | Evidence and limit                                                                                                                |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Wrong key / modified ciphertext is rejected | `test/box.test.js` exercises these controls; not collection integrity or rollback protection                                      |
| Existing v1 material remains readable       | Legacy fixture tests in `test/box.test.js`; not every possible historical payload                                                 |
| Identification and browser workflows work   | 120 browser checks at the baseline, using Chromium virtual authenticators and fake GitHub; not a real-device compatibility matrix |
| No external app runtime imports             | Runtime import scan plus source review; not proof that delivered same-origin code is benign                                       |
| Reproducible delivered artifact             | Nix checks, strict MkDocs, site smoke, `COMMIT`, attested app/site manifests; not cryptographic certification                     |

The four findings in
[issue #16](https://github.com/lambdasistemi/fido2box/issues/16) remain open:
stale replacement state, non-revoking key removal, incomplete vault integrity,
and unenforced authenticator policy. Test counts do not close them.
