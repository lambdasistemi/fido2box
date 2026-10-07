# Research: Expressive recovery records

**Date**: 2026-10-07. **Baseline**: main at d93df3d. **Scope**: issue #26;
read-only format and UI investigations, then design decisions. No behavior,
hardware interoperability, or cryptographic assurance is proved here.

## R1 — Separate format interpretation from encryption

- **Evidence**: `web/crypto.js:77–98` projects three properties, discards
  unknown members, and extracts a Secret Key instead of retaining its
  surrounding note. `app.js:80–83` repeats box-format construction outside that
  module.
- **Decision**: pure record/domain and format owners; encryption accepts exact
  serialized text. Keep AES-GCM, fresh IVs, HKDF wrapping, and RP identity
  unchanged.
- **Alternative rejected**: add optional properties to the old triple; older
  parsers would silently discard them. No new runtime dependency is needed.

## R2 — Explicit versions, without claiming downgrade safety

- **Evidence**: import checks versions 1/2 (`app.js:122`), but Pull does not;
  `listItems` treats every non-v1 as v2 and `commit` always emits v2.
- **Decision**: outer v3 retains keys/items layout; each encrypted payload has
  its own explicit format/version/type. Unknown properties or versions block all
  mutations of the containing box. Original encrypted material stays exportable.
- **Alternative rejected**: changing only the marker or renaming items does not
  make deployed old clients fail closed. Warn explicitly against older writers.
  Keep a durable pre-migration backup and offer its download before migration.

## R3 — Legacy interpretation is bounded by provenance

- **Evidence**: v1 is a single encrypted note; v2 writers emitted JSON triples.
  Current v1 fixtures are constructed in `test/box.test.js:34–45`, not
  standalone published JSON fixtures. One assertion currently expects note
  truncation.
- **Decision**: v1 plaintext is always preserved in full, even when it resembles
  JSON. v2 accepts only the documented triple shape; ambiguous or unknown
  payloads remain immutable and exportable, never guessed into editable records.
  New payloads carry explicit discrimination. Blank legacy titles remain valid.
- **Alternative rejected**: recursive guessing or regex replacement cannot infer
  the intent of untagged data. No automatic extracted-key field is necessary.
  Replace the lossy fixture expectation with whole-note preservation.

## R4 — Service credentials are not recovery fields

- **Evidence**: `github-token` title alone distinguishes service data in
  `app.js:63,166,206`; historic user/title collisions cannot be disambiguated.
- **Decision**: preserve that legacy interpretation; v3 has an encrypted
  github-token type retaining both the original URL and secret. New user records
  cannot use the reserved title. Field suggestions need no persisted purpose
  taxonomy.
- **Alternative rejected**: discover tokens by arbitrary custom field names or
  render the legacy token through the ordinary editor.

## R5 — One write boundary for every mutation

- **Evidence**: Pull leaves cached plaintext/key alive (`app.js:225`); unlock
  and enrollment can finish later; item/token handlers mutate plaintext before
  saving. Locked v1 key removal can overwrite the note with empty items.
- **Decision**: generation-bound sessions, immutable candidates, per-box write
  serialization, and full-source compare-and-swap inside the storage
  transaction. All content/key/token edits require an unlocked, completely
  understood box. Replacement invalidates old sessions; stale completions cannot
  publish data.
- **Alternative rejected**: clearing one cache on Pull or using revision alone
  cannot protect deferred operations or same-revision, different-key
  replacements. Fix the stale-Pull subset of #16 before enabling the feature; do
  not close #16.

## R6 — Backup first, then guarded replacement

- **Decision**: retain the pre-migration encrypted source in a separate
  `recover-box-backups` IndexedDB database before replacing the active box.
  Confirm the backup transaction and read it back; failure blocks migration. An
  extra backup after a failed active write is harmless. This is deliberately not
  a claim of atomic transactions across two databases.
- **Rationale**: preserve existing `recover-box` / `boxes` names and database
  version; upgrading that database would unexpectedly exclude older local
  clients. The active write still uses one atomic read/compare/write
  transaction.
- **Alternative rejected**: download alone cannot establish durable local
  retention, and an automatic download cannot prove the user saved it elsewhere.
- **Source fidelity**: retain UTF-8 source text from file/GitHub ingress. For
  existing IndexedDB objects, original file whitespace was never retained;
  serialize their complete encrypted object without pretending it is original
  bytes.

## R7 — Preserve values independently of controls

- **Evidence**: existing editor trims values; normal HTML textarea values
  normalize line endings
  ([HTML textarea definition](https://html.spec.whatwg.org/multipage/form-elements.html#the-textarea-element)).
- **Decision**: keep original strings in immutable drafts; reveal, hide, kind,
  name, and title edits do not reread untouched values from controls. Deliberate
  value edits replace the value with the control's input string; explain LF
  line-ending normalization when editing imported CR/CRLF text.
- **Alternative rejected**: a password input for multiline secrets or collecting
  all values from form controls on Save would change untouched recovery
  material. Hidden existing fields use a mask plus Reveal/Replace, without
  secret DOM values.

## R8 — Existing browser effects stay narrow

- **Decision**: one clipboard controller; safeUrl remains the navigation
  authority. Parser-normalized HTTPS and loopback HTTP behavior stays unchanged,
  including credential-bearing URLs. Copy always uses stored text, not
  normalized href. Clipboard operations are serialized; delayed clearing retains
  an ephemeral comparison fingerprint and still runs after lock.
  Read/compare/write remains best effort, not atomic against other apps.
- **Evidence**: `url.js:5`, `app.js:173`; the current global timer belongs
  outside record presentation. View/editor callbacks do not discover browser
  globals.

## R9 — Verification and integration

- **Evidence**: explicit tsconfig module list excludes app.js. Unit commands
  occur in Just, npm, and Nix; manifests/runtime scan enumerate flat web files.
- **Decision**: include every changed/new JS module, including touched app
  orchestration, in checkJs. Expand existing unit entry points or synchronize
  all runners if adding one. Add real-browser tests with deterministic deferred
  effects.
- **Alternative rejected**: unchecked modules, silently skipped browser tests,
  or testing only new-record success without old fixtures and failure races.

## Tooling disposition

No new technology is selected. The installed Spec Kit package has no
`update-agent-context.sh`; its conditional invocation confirmed absence. No
synthetic agent instructions or duplicate repository-local skills are created.
No before/after planning extension hooks are configured.
