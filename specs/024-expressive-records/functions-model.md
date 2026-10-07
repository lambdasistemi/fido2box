# Functions Model: Expressive recovery records

Declarations only; no implementations or local helper designs. Owners are
[modules-model.md](modules-model.md); every domain/port/result type is defined
in [data-model.md](data-model.md). Parameters are named in each signature.
Readonly inputs must not be mutated. Result failures never echo private values.
Unchanged call surfaces and implementation-private helpers are omitted.

## `web/records.js`

| Signature                                                           | Requirement / constraints                                       |
| ------------------------------------------------------------------- | --------------------------------------------------------------- |
| `createRecord(id: RecordId, title: string): RecoveryRecord`         | FR-001; new title validated before persistence                  |
| `suggestField(suggestion: SuggestionName, id: FieldId): Field`      | FR-003; names/defaults from spec; empty value                   |
| `beginDraft(record: RecoveryRecord): RecordDraft`                   | FR-001; original retained immutably                             |
| `changeDraft(draft: RecordDraft, change: DraftChange): RecordDraft` | FR-001–003; exact strings and ID-based changes                  |
| `validateRecord(record: unknown): readonly ValidationIssue[]`       | FR-002/009; strict untrusted schema and legacy flag consistency |
| `validateDraft(draft: RecordDraft): readonly ValidationIssue[]`     | FR-001/003/010; includes title provenance and reserved name     |
| `finishDraft(draft: RecordDraft): Result<RecoveryRecord>`           | FR-001/007; no partial invalid result                           |

SuggestionName is the closed set Account, Password or recovery key, Website,
Backup codes, Notes. Empty new drafts use createRecord with a supplied ID;
invalid draft titles may exist transiently but cannot be saved. Optional double
entry uses changeDraft confirmation changes; validateDraft and finishDraft
reject mismatches without including either secret in errors.

## `web/record-codec.js`

| Signature                                                                                     | Requirement / constraints                                                     |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `decodeRecord(text: string, outerVersion: 1 \| 2 \| 3, ids: readonly string[]): DecodeResult` | FR-008/009; supplied IDs only for legacy conversion; no ID generation/effects |
| `encodeRecord(payload: Payload): Result<string>`                                              | FR-007/009/010; validates all members; no projection of unknown fields        |

A legacy conversion needs one record ID and up to two field IDs; the supplied
list has exactly three unique nonempty IDs. Unused IDs are ignored. For v3 the
list is empty and persisted IDs are retained. This is an argument precondition,
not permission to invent missing IDs in a malformed current payload.

## `web/box-format.js`

| Signature                                                                                                 | Requirement / constraints                                                       |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `readSource(text: string): Result<SourceDocument>`                                                        | FR-009; retain source text; reject invalid JSON without overwriting anything    |
| `inspectBox(value: unknown): BoxInspection`                                                               | FR-008/009; strict version/type/member validation                               |
| `keysOf(box: Box): readonly KeyEntry[]`                                                                   | FR-008; version-directed, no unknown-version fallback                           |
| `emptyVault(rpId: string): BoxV3`                                                                         | FR-007; new v3 envelope, revision zero                                          |
| `buildBox(source: Box, items: readonly Sealed[], keys: readonly KeyEntry[], rpId: string): Result<BoxV3>` | FR-007–009; validate source; revision +1 without overflow, preserve RP identity |
| `sourceFromBox(box: Box): SourceDocument`                                                                 | FR-007; full serialized source for newly encrypted output                       |

## `web/crypto.js`

| Signature                                                          | Requirement / constraints                                      |
| ------------------------------------------------------------------ | -------------------------------------------------------------- |
| `encryptText(data: BufferSource, text: string): Promise<Sealed>`   | FR-007; fresh IV; exact encoded text, no schema                |
| `decryptText(data: BufferSource, sealed: Sealed): Promise<string>` | FR-008; authenticated decryption rejects before interpretation |

Existing encryption/wrapping primitives keep their construction. Planned removal
of schema-owning encryptItem/decryptItem/parseItem/listItems/addItem/upgrade and
relocation of keysOf/emptyVault/TOKEN_TITLE must be reviewed with updated
callers and regression coverage before implementation. They are internal app
exports, not a third-party API compatibility promise. No crypto helper is
silently duplicated.

## `web/store.js`

| Signature                                                                                                                                                   | Requirement / constraints                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `lib.get(name: string): Promise<StoredBox \| undefined>`                                                                                                    | FR-007; normalize wrapper in memory only                                          |
| `lib.list(): Promise<readonly StoredBox[]>`                                                                                                                 | FR-007; no read-time writes                                                       |
| `lib.compareAndSwap(name: string, expected: SourceIdentity \| null, next: SourceDocument \| null, signal: AbortSignal): Promise<Result<StoredBox \| null>>` | FR-007/009; transaction-atomic comparison/replacement/deletion; null next deletes |
| `backups.retain(name: string, source: SourceDocument): Promise<Result<Backup>>`                                                                             | FR-008; immutable, idempotent by name+source; complete transaction and read-back  |
| `backups.get(id: BackupId): Promise<Backup \| undefined>`                                                                                                   | FR-008; read exact encrypted source                                               |
| `backups.list(name?: string): Promise<readonly Backup[]>`                                                                                                   | FR-008; download choices; no plaintext                                            |

Unconditional lib.put/lib.del cease being app mutation entry points; existing
tests and callers must move together. No await for encryption/networking occurs
inside the active IndexedDB transaction. Aborting after transaction completion
cannot reverse a committed save.

## `web/box-session.js`

Factory: `createBoxSessions(ports: BoxSessionPorts): BoxSessions`. The returned
controller exposes the following signatures:

| Method                                                                                                                                | Requirement / constraints                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `create(name: string, keyName: string, rpId: string): Promise<Result<SessionView>>`                                                   | FR-007; private fresh data key, enrollment, absent-source CAS               |
| `unlock(name: string): Promise<Result<SessionView>>`                                                                                  | FR-007–009; source/generation capture, injected authenticator               |
| `get(name: string): SessionView \| null`                                                                                              | FR-006/010; no key bytes in returned view                                   |
| `prepareMigration(name: string, token: SessionToken, approved: boolean): Promise<Result<MigrationApproval>>`                          | FR-008; approved exact source only; verified durable backup before mutation |
| `mutate(name: string, token: SessionToken, mutation: BoxMutation, approval: MigrationApproval \| null): Promise<Result<SessionView>>` | FR-001/007–010; common eligibility gate and atomic publication              |
| `replace(name: string, expected: SourceIdentity \| null, next: SourceDocument): Promise<Result<StoredBox>>`                           | FR-007/009; invalidate immediately; stays locked on success/failure         |
| `remove(name: string, expected: SourceIdentity): Promise<Result<void>>`                                                               | FR-007; invalidate immediately; guarded deletion, backups retained          |
| `lock(name: string): void`                                                                                                            | FR-006; invalidate generation and cancel pending mutation transactions      |

Key and token edits call mutate. No app caller may bypass this controller for
writes. Same-box write ordering and operation cancellation belong here,
including operations triggered while another view is displayed.

## `web/github.js` and `web/webauthn.js`

| Signature                                                                                                         | Requirement / constraints                                                                                       |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `fetchRemote(repo: string, token: string, name: string, f?: Fetch): Promise<SourceDocument \| null>`              | FR-007/009; preserve decoded source text, not merely parsed object                                              |
| `saveToGitHub(repo: string, token: string, text: string, rev: number, f?: Fetch, path?: string): Promise<string>` | FR-007/009; existing conflict behavior retained; refuse unsupported/malformed remote envelopes before overwrite |
| `enrolKey(name: string, data: BufferSource): Promise<KeyEntry>`                                                   | FR-007/008; returns only the new wrapped entry, not a replacement box                                           |

unlockVault retains its signature, using box-format's Box/keysOf. Transport
errors remain non-secret. This feature does not authenticate remote revision
metadata, or prove unknown encrypted remote payloads safe merely from envelope
inspection.

## `web/dom.js`

`element<K extends keyof HTMLElementTagNameMap>(tag: K, props: ElementProps | null, ...children: readonly Child[]): HTMLElementTagNameMap[K]`.

FR-011: literal text/node children only. Preserve ignore/autocomplete attributes
for inputs and add them for textareas. No untrusted raw HTML path.

## `web/record-view.js` and `web/record-editor.js`

| Signature                                                                                                     | Requirement / constraints                                                  |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `recordView(record: RecoveryRecord, revealed: ReadonlySet<FieldId>, actions: RecordViewActions): HTMLElement` | FR-004–006/011; URL policy applies only to visible URL fields              |
| `recordEditor(draft: RecordDraft, state: EditorPresentation, actions: RecordEditorActions): HTMLElement`      | FR-001–003/006/011; untouched raw values never reconstructed from controls |

View actions: copy(fieldId): Promise<void>, reveal(fieldId): void,
hide(fieldId): void, edit(): void. Editor actions: change(change): void,
reveal(fieldId): void, hide(fieldId): void, replace(fieldId): void, save():
Promise<void>, cancel(): void. Arguments use the corresponding D1/D6 types;
callbacks own effects outside views. Editor actions also expose
revealConfirmation(fieldId): void and hideConfirmation(fieldId): void;
confirmation changes use change(change).

## `web/record-session.js`

Factory: `createRecordSession(ports: RecordSessionPorts): RecordSession`.

| Method                                                       | Requirement / constraints                                                               |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `open(boxName: string, recordId: RecordId \| null): boolean` | FR-006; null binds an empty box; false if discard refused; resets old reveal state      |
| `beginEdit(recordId: RecordId \| null): void`                | FR-001; null creates draft with supplied new ID                                         |
| `requestLeave(): boolean`                                    | FR-006; explicit dirty-draft confirmation                                               |
| `reset(reason: "leave" \| "lock" \| "replace"): void`        | FR-006; immediate discard on lock/replace                                               |
| `render(session: SessionView): HTMLElement`                  | FR-011; list and single active detail/editor, preserves draft across incidental renders |

Save/copy/change/reveal events are bound internally to the modeled ports.
Navigation, tab switching, and record switching must use requestLeave; lock does
not ask. Window unload uses the browser's best-effort confirmation facility.

## `web/clipboard.js`

Factory:
`createClipboardController(ports: ClipboardPorts): ClipboardController`.

| Method                                     | Requirement / constraints                                        |
| ------------------------------------------ | ---------------------------------------------------------------- |
| `copy(value: string): Promise<CopyResult>` | FR-004; success only after write; generation-bound delayed clear |
| `dispose(): void`                          | Page teardown only; never called merely because a box locks      |

One app-level controller serves all fields. All copy/read/clear writes are
serialized, including already-started asynchronous clears; generation checks
supplement that ordering. A failed new copy does not cancel the prior timer.
Only a SHA-256 comparison fingerprint is retained for the scheduled clear, not
the copied string. Lock and route changes leave that attempt scheduled; dispose
is for page teardown. Fingerprints are ephemeral equality aids, not an
encryption/access-control boundary. ClipboardPorts adds fingerprint(value:
string): Promise<string>, supplied using browser WebCrypto. This does not change
vault cryptography or guarantee clipboard erasure.

## `web/app.js` integration

Existing local signatures render(): void, itemsTab(name: string): HTMLElement,
syncTab(name, rec, rem): HTMLElement and connectCard(name: string): HTMLElement
retain their purposes, but delegate field state and all mutations to modeled
owners. rec/rem become StoredBox/SourceDocument or undefined as appropriate.
unlock(name) becomes a controller call; commit(name, keys), currentToken's
title-based search, and the local h helper are replaced by their new owners.
currentToken(): string consults explicit service payloads, preserving
session-token override and first-token ordering. Route handlers coordinate
departure/reset. All changed orchestration enters checkJs; no feature schema is
reimplemented here. The Boxes view also lists retained backups across all box
names, including deleted boxes, and provides encrypted downloads without
requiring an active box.
