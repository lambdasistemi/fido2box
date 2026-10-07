# Recover GitHub boxes with the key

A person arriving at the original site with a configured security key can fetch
their encrypted boxes before unlocking any box. A new or unconfigured key gets a
visible setup path rather than instructions to open a box containing the token
needed to fetch that box.

Issue: [#34](https://github.com/lambdasistemi/fido2box/issues/34). Status:
design and implementation candidate, not shipped or independently audited.

## Operator rulings

On 2026-10-07 the operator reported the circular dependency and ruled:

> so the github token has to be stored inside the key

> Fix the design and fix the code

Precision for implementation: the key must carry both the token and repository
location in a record discoverable without a local credential-ID list. Reading it
requires user verification. This does not enroll that key in existing boxes; the
original enrolled credentials still control box decryption. One-time setup
requires an independently obtained GitHub token; token expiry/revocation still
requires renewal through GitHub. No box is a prerequisite of setup or recovery.

## Recovery story and acceptance

1. An empty library has one primary **Use security key** action. First-time
   setup is available through a secondary **First time with this key?**
   disclosure. A successful read connects directly. An unanswered request offers
   retry and explicit setup without claiming the key is empty or automatically
   writing to it. A known profile with rejected access promotes renewal.
2. Setup accepts a repository and masked token, validates GitHub access, writes
   an encrypted access record to supported key storage and verifies it by
   reading it back. It never reports success from enrollment alone.
3. With every browser store cleared and a new document, Connect discovers the
   credential, checks user verification, reads and decrypts the key-held access
   record, then lists remote boxes. No box, token, repository or credential ID
   is supplied from browser persistence. No GitHub login is needed while the
   stored token remains valid.
4. Pull and box unlock remain explicit actions. Fetching a box with an access
   key does not grant that key decryption rights it did not already have.
5. Unsupported storage/PRF, no selected access credential, malformed/unknown
   profile, failed write/readback, rejected GitHub token, and cancellation have
   actionable outcomes. No failure silently uses an unrelated box-held token.
6. Disconnect/cancel or a newer connection rejects late key/network results. A
   late fetch cannot replace a box after changing the GitHub connection.
7. Existing box/key formats, full legacy records, GitHub service records and
   manual encrypted-file recovery continue to work. The primary connection UI
   stops directing users to save their bootstrap token inside a remote box.
8. Tokens remain masked in forms, absent from notices, logs, user handles and
   browser persistence, and encrypted in key storage. Successful save clears the
   entry form. Unsupported keys get an explicit refusal, not a false claim that
   all FIDO2 keys support this feature.

## Scope and evidence boundary

Use browser-standard discoverable credentials, PRF and largeBlob; no backend,
native bridge, custom cipher or runtime dependency. The storage requirement is
an explicit capability restriction; the operator's physical key/browser remain
to be identified. A Chromium virtual-device experiment has verified write and
recovery after clearing every browser store. CDP credential export loses PRF
enablement, so tests preserve the virtual device while clearing browser state;
they do not claim physical-device portability or independent security review.
The original origin, a working key and a valid token/repository remain recovery
requirements. No change to the broader unresolved audit #16 is implied.
