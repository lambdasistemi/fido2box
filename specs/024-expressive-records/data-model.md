# Data Model: Expressive recovery records

Ownership is defined in [modules-model.md](modules-model.md). This is a
declarative model, not implementation code. All strings are preserved exactly
unless the user explicitly edits that value.

## D1 — RecoveryRecord and Field (`records.js`)

Encrypted recovery payload members:

| Member         | Type and constraint                                                                       |
| -------------- | ----------------------------------------------------------------------------------------- |
| format         | Literal `fido2box-record`                                                                 |
| version        | Literal integer 1                                                                         |
| type           | Literal `recovery`                                                                        |
| id             | Nonempty opaque string, unique among payload IDs in its box                               |
| title          | String; nonblank for new or explicitly renamed records                                    |
| legacyUntitled | Optional literal true; only valid with a whitespace-only title inherited from legacy data |
| fields         | Ordered Field array; empty is valid                                                       |

Field members are exactly `id: string`, `name: string`,
`kind: "text" | "multiline" | "url"`, `hidden: boolean`, and `value: string`.
IDs are nonempty and unique within the record; names are nonblank but need not
be unique. Values may be empty. No trimming, Unicode normalization, numeric
coercion, URL normalization, or sorting occurs in the domain or codec.

New IDs come from an injected ID supplier in the effect layer; pure functions
receive them as arguments. Legacy IDs are stable within an unlocked session and
become persistent on migration. Suggestions instantiate ordinary fields using
the spec defaults; semantic purpose is not persisted or inferred from names. No
new artificial field/size cap is introduced; SC-005 is the tested minimum.
Resource or storage failure rejects the operation without partial persistence.

## D2 — ServiceRecord and DecodeResult (`record-codec.js`)

A ServiceRecord has exactly `format: "fido2box-record"`, `version: 1`,
`type: "github-token"`, `id: string`, `title: "github-token"`, `url: string`,
and `secret: string`. Retaining URL/secret avoids loss when converting a
historical token triple. It never enters ordinary record controls. Multiple
historical tokens retain order and existing first-token lookup semantics.

Payload is the RecoveryRecord | ServiceRecord union. DecodeResult is either
`{status: "ok", payload: Payload}` or
`{status: "unsupported" | "invalid", code: string}`; failure contains no
plaintext value. Unknown members, versions, discriminators, kinds, malformed
types, or duplicate IDs prohibit mutation. A supported record may still be
viewed/copied when another payload is unsupported, but the whole box is
read-only.

Legacy recognition:

- Outer v1: one complete plaintext note, always mapped to one hidden multiline
  field named Notes, with title Secret. JSON-looking text remains note text.
- Outer v2: a JSON object with only title?, url?, secret; secret is required
  string, optional members must be strings when present. Unknown structures,
  non-JSON content, and wrong types refuse migration without reinterpretation.
- Missing title maps to empty; missing, empty, or whitespace-only legacy titles
  set legacyUntitled true. URL is omitted when absent, otherwise becomes a
  visible URL field (even when empty). Secret becomes a hidden text field named
  Secret.
- A v2 title github-token uses ServiceRecord with absent URL mapped to empty;
  its historical reserved meaning cannot be safely inferred differently.
- Explicit title editing clears legacyUntitled and requires a nonblank title.
  Renaming a user record to github-token is invalid.

## D3 — Box and SourceDocument (`box-format.js`)

Existing key entry members remain name, id, wrapIv, wrapped, all strings. A
Sealed item remains base64 iv and ct. AES-GCM construction is unchanged.

| Version | Recognized outer members                 |
| ------- | ---------------------------------------- |
| 1       | v=1, entries, iv, ct; optional rpId, rev |
| 2       | v=2, keys, items; optional rpId, rev     |
| 3       | v=3, keys, items, rpId, rev              |

All present revisions are nonnegative safe integers; absent legacy revision
means zero for a new revision. Array/object/scalar types and ciphertext/base64
structure are validated. Unknown members anywhere in an envelope or key/sealed
entry make it read-only; no structural projection may discard them. Structurally
readable legacy alternatives are not silently combined (for example keys plus
entries). The existing crypto test fixtures define the supported legacy shapes.

SourceDocument contains exact source text plus its parsed JSON value (unknown
until inspected). Existing library entries without source text get a complete
serialization of their existing object. This preserves encrypted members, not
unavailable original whitespace. BoxInspection reports readable supported Box or
null, write eligibility, and non-secret reason codes. Unsupported source can be
stored/exported verbatim without being unlocked or edited.

New boxes and successful format-changing writes emit v3. Existing keys/data key
and RP identity remain unchanged; a missing legacy rpId is resolved to the
current successfully unlocking origin. New payload metadata is all encrypted.
There is no claim that v3 authenticates the outer revision, item list, or order.

## D4 — StoredBox, SourceIdentity, Backup (`store.js`)

StoredBox extends the existing name/box/savedAt wrapper with sourceText. The
recover-box database and boxes store retain their existing names/version. Reads
of old wrappers do not rewrite them. SourceIdentity is the exact retained source
string, or full object serialization for old wrappers, never revision alone. It
is internal and must not be printed as an error.

A Backup has an opaque backup ID, box name, createdAt, SourceIdentity, and full
encrypted source text. It lives in recover-box-backups, store snapshots,
separate from the active library. Each source identity gets an immutable
retained snapshot; a later migration of different legacy data under the same
name gets another. Backups are never silently replaced or deleted with the
active box. List/download is available from Sync and a global Retained backups
group in Boxes, including names with no active box. Deletion management is
outside this feature.

Backup transaction success plus matching read-back is required before the active
migration write. Active compare-and-swap compares SourceIdentity inside the same
readwrite transaction as replacement or deletion. Expected null means absent.
Storage errors leave the saved box unchanged. Failed migration may leave a
useful extra backup. Browser-data loss can erase both databases: external
download is still necessary. No cross-database atomicity is claimed.

## D5 — Sessions and mutations (`box-session.js`)

SessionToken is opaque and bound to box name, complete source identity, and a
monotonic in-memory generation. SessionView contains token, decoded payloads,
write eligibility and reason codes, but never exposes data-key bytes to UI code.
Private session state holds the key and source. BoxMutation is one of record
upsert/delete, token set/remove, or key add/remove, with explicit target IDs. A
key-add operation supplies an authenticator callback, not an already trusted
replacement box. Every content/key/token mutation requires complete decoding, an
unlocked session, validation, and current token. At least one key must remain.

| Event                                            | Required observable transition                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Unlock starts/completes                          | Capture generation/source; publish only if both still current                  |
| Save                                             | Immutable candidate; persistence completes before publishing updated plaintext |
| Save fails                                       | Saved record/session remain unchanged; draft remains available                 |
| Pull/replace begins                              | Invalidate generation and clear key/plaintext/draft/reveal                     |
| Pull/replace succeeds or fails                   | Remain locked; never restore the invalidated session                           |
| Lock/delete                                      | Invalidate pending work immediately; no late plaintext publication             |
| Another tab writes                               | Full-source storage CAS refuses stale mutation; require fresh unlock           |
| Successful save followed by view-refresh failure | Report save as committed, not as a failed transaction                          |

Writes are serialized per box, not by ephemeral button handlers. A lock or
replacement invalidates a not-yet-committed save, and aborts its active storage
transaction when possible. The storage commit is the linearization point: an
already committed save is not undone by a later lock, but cannot republish
plaintext. Generation checks occur at async boundaries and before transaction
submission; storage CAS catches replacement by another tab.

## D6 — Draft and presentation state (`records.js`, `record-session.js`)

RecordDraft holds immutable original (or null), candidate, removed-field undo
entries with original positions, and validation state. DraftChange covers title,
add/update/remove/undo by ID. UI state separately owns revealed IDs, explicitly
replacing IDs, active record, focus target, and session generation.

Untouched values remain original strings regardless of control rendering. A
deliberate value input replaces only that value with the browser input string.
For CR/CRLF imports, show a line-ending warning before editing; revealing alone
does not normalize. Locked/cancelled/departed sessions drop draft, reveal, and
undo references; no draft is stored in IndexedDB/localStorage or logs.

## D7 — Narrow ports

- RecordViewActions: copy/reveal/hide/edit callbacks by stable field ID.
- RecordEditorActions: typed change, reveal/hide/replace, save/cancel callbacks.
- EditorPresentation: revealed/replacing IDs, validation issues, busy and focus
  state.
- RecordSessionPorts: obtain session, persist mutation, copy exact text, confirm
  discard/migration, announce non-secret status, and create opaque IDs.
- BoxSessionPorts: storage/backup interfaces, ID supplier, and bound
  authenticator callbacks; networking and DOM remain outside.
- ClipboardPorts: readText, writeText, timers, and non-secret result notices.
  ClipboardController owns serialized operation order, generation, the last
  successful-copy timer and an ephemeral SHA-256 comparison fingerprint, not a
  retained copied string. Lock does not cancel its scheduled clear.
- CopyResult: copied or failed, without including the value.
- ValidationIssue: non-secret code and record/field ID; no invalid value echo.
- Child/ElementProps: DOM nodes or literal text plus typed element properties
  and event listeners; no raw HTML API.

## Invariants for proof and tests

I1: A committed mutation derives from the exact stored predecessor and current
session. I2: Failed or unsupported mutations preserve the saved encrypted
source. I3: Untouched field strings and ordered attributes survive every
accepted round trip. I4: Lock/replacement prevents late plaintext/reveal
publication. I5: Masked rendering exposes no value-bearing text, attributes, or
active URL. I6: Service payloads cannot enter user-record controls.

These are design obligations, not completed proofs. Formalization and the
corresponding generated/state-transition tests must be scheduled before behavior
implementation; cryptographic security is not inferred from these invariants.

## D8 — Interface vocabulary

IDs (RecordId, FieldId, BackupId) and box names are string aliases with D1/D4
constraints. Result<T> is success with value T, or failure with a non-secret
code: Invalid, Unsupported, Locked, Stale, Conflict, MigrationRequired,
BackupFailed, StorageFailed, or AuthFailed. No error embeds supplied plaintext.
Persisted success is distinct from a subsequent rendering/refresh failure.

BoxMutation is a tagged union with these explicit members:

| kind          | Additional members                        |
| ------------- | ----------------------------------------- |
| upsert-record | record: RecoveryRecord                    |
| delete-record | recordId: RecordId                        |
| set-token     | id: RecordId, url: string, secret: string |
| remove-token  | id: RecordId                              |
| add-key       | name: string                              |
| remove-key    | credentialId: string                      |

The common upsert gate compares the saved predecessor: new records may not claim
legacyUntitled; an existing legacy blank title must remain exactly the same
string while flagged. A changed title must be nonblank and clear the flag. This
rule applies independently of UI draft validation.

The injected enrollment port receives the current private data key and returns a
KeyEntry; UI code passes the authenticator function, not the key itself.
MigrationApproval binds explicit user approval to a SourceIdentity and a
retained, read-verified BackupId; it cannot authorize a different source or skip
validation. Box-session validates this binding against the backup store on every
migration.

DraftChange is a tagged union: title(value), add(field), update(fieldId, patch),
remove(fieldId), undo(fieldId). A patch may contain name, kind, hidden, value;
it may not replace identity. Validation issues refer to title or field ID.
RecordSessionPorts use the box-session/clipboard interfaces in the functions
model, plus confirmDiscard(): boolean, approveMigration(source):
Promise<boolean>, notice(code): void, and newId(): string. ClipboardPorts
declare readText(): Promise<string>, writeText(value): Promise<void>,
fingerprint(value: string): Promise<string>, schedule(callback, milliseconds):
number, cancel(timerId): void, notice(code): void. BoxSessionPorts declare
storage/backup methods from store, newId(): string, unlock(box):
Promise<ArrayBuffer>, and enrol(name, data): Promise<KeyEntry>.
