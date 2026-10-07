# Deliver expressive recovery records

Box owners will save named recovery fields without needing a website, check
typed secrets when they choose, and recover both old and new boxes without
losing values. This is the implementation checklist, not a shipped-feature
claim.

## Setup and design review

- [x] Confirm the unchanged baseline with `nix develop --quiet -c just ci`.
- [x] Reconcile optional URLs and secret confirmation in `spec.md`, the module,
      data/function models, `contracts/ui.md`, and `quickstart.md`.
- [x] Review the task coverage and model consistency before implementation.
- [x] Add abstract transition definitions and proofs in
      `lean/Records/Model.lean` and `lean/Records/Proofs.lean`; map each claim
      to implementation tests.
- [x] Wire proof execution into `justfile`, `nix/checks.nix`, and the pinned
      `flake.nix` toolchain. These prove the abstract model, not cryptography.

## Keep exact fields in a record

Independent outcome: named fields and optional confirmation obey the contract;
no URL is required and only the primary values enter the serialized record.

- [x] Write failing behavioral cases in `test/records.test.cjs`; implement the
      modeled record/draft/suggestion/validation functions in `web/records.js`.
      Cover blank/duplicate names, stable IDs, undo, exact strings, reserved
      titles, legacy title provenance, optional URL and optional double entry.
- [x] Write failing codec cases in `test/records.test.cjs`; implement
      `web/record-codec.js`, including full v1 notes, strict v2 triples,
      discriminated v3 payloads, service tokens and unknown-data refusal.
- [x] Include these owners in `tsconfig.json` and invoke their tests through
      `test/box.test.js`, preserving npm/Just/Nix runner equivalence.

## Recover old and new boxes safely

Independent outcome: migration keeps a downloadable original; failed or stale
writes cannot destroy the saved source or publish unlocked data after lock.

- [x] Freeze synthetic legacy fixtures under `test/fixtures/`; write failing
      strict-envelope cases and implement `web/box-format.js`.
- [x] Add real IndexedDB tests for source-preserving reads, atomic comparison,
      abort/conflict, immutable backup/read-back and backup-only discovery;
      implement `web/store.js` without changing the active database version.
- [x] Reproduce stale Pull, deferred unlock/enrollment, failed save, locked v1
      key removal and same-revision different-key replacement; implement
      `web/box-session.js` with generation fences and serialized mutations.
- [x] Move schema handling out of `web/crypto.js`; update `web/github.js`,
      `web/webauthn.js` and all callers together. Preserve the newly merged
      known-key identification flow and original cryptographic construction.
- [x] Exercise every content/key/token mutation, backup failure, cross-tab
      conflict and successful save followed by failed UI refresh in browser
      tests.

## Use and edit fields without exposing others

Independent outcome: real browser controls save a secret-only record, reveal and
optionally confirm typed secrets, copy exact values and link safe URLs.

- [x] Write failing browser scenarios in `test/browser.test.js`; extract the
      literal element helper to `web/dom.js`; build `web/record-view.js` and
      `web/record-editor.js` with accessible controls and independent reveal.
- [x] Test dirty-draft navigation, removal/undo and temporary-state clearing;
      implement `web/record-session.js`, including all modeled callbacks.
- [x] Test clipboard rejection, changed content, one-minute clear and in-flight
      clear/copy ordering; implement `web/clipboard.js` using injected ports.
- [x] Replace old item composition in `web/app.js`, routing every write through
      the session owner. Include changed orchestration in `tsconfig.json`.

## Release checks and guidance

- [x] Cover malicious text/URLs, hidden DOM, keyboard, both themes, 320-pixel
      layouts, 20 fields and a 10,000-character value in real browser tests.
- [x] Verify save/reload, download/import, fake-GitHub push/pull and legacy
      migration against `quickstart.md`; leave the broader audit issue open.
- [x] Update README, in-app guidance, recovery/security/development docs and
      comparison current/planned wording to match actual behavior.
- [x] Run full local CI, sandboxed flake checks and built-site smoke.
- [ ] Confirm hosted CI on the final head and resolve the deferred independent
      review decision before feature merge; current receipts are in PR #33.

## Ordering and commit discipline

The design review/proofs precede behavior work. Record validation precedes the
codec; envelopes precede storage/session integration; guarded storage precedes
enabling the editor. View and clipboard tests can be developed independently,
but this delivery is solo. All three stories are required for release.

Each behavior checkbox is one reviewed slice containing its failing test,
minimal implementation, passing evidence and corresponding documentation; never
commit a failing test separately. Use descriptive commit bodies recording the
observed failure and the passing command. No unfinished writer is enabled in the
app and no compatibility promise is inferred from green unit tests.

## Solo review and proof scope

All specified actions, formats, storage/session methods and UI callbacks have an
owner and task. Confirmation is transient draft state, never encoded. No
unresolved model conflict was found. Independent review remains deferred.

The theorems in `lean/Records/Proofs.lean` describe the abstract transition
contract: current predecessor/generation, failed/unsupported writes, lock and
replacement map to the session failure/race tests; rename and structural round
trip map to draft/codec tests; masked rendering and service separation map to
browser tests; the three confirmation cases map to exact-match, mismatch and
opt-out draft tests. Proofs do not establish JSON, cryptographic or browser
correctness; all corresponding implementation tests remain required.

Record-model evidence: all 18 behavioral checks executed against unimplemented
public functions and failed, then passed with the implementation, including 256
generated records. The earlier missing-module run was not behavioral evidence.
`nix develop --quiet -c just typecheck unit` passed 23 core, 18 record and two
tooling checks. This does not establish codec, storage or UI behavior.

Codec evidence: 12 additional behavioral checks executed the unimplemented codec
and failed, then all 30 record/codec checks passed, including 128 generated
codec round trips. Typecheck and the existing core/tooling suites passed too.
Both components are now used by the app through the guarded session owner.

Storage and session evidence: frozen synthetic v1/v2 fixtures decrypt with the
pre-change construction. Eight real IndexedDB cases cover exact-source
comparison, concurrent writes, abort during put, quota failure, immutable backup
read-back and discovery after deletion. The backup-add exception failed before
the repair and then passed without an uncaught browser error. Twelve session
scenarios executed against unimplemented controller methods and failed before
implementation; four further checks cover successful mutation routes, competing
saves, title provenance and lock during storage. These exercise the controller
with real IndexedDB and synthetic authentication ports. The old app writer has
been removed. All app mutations use the session owner.

App and field evidence: the original app executed the Pull regression with
163/165 checks passing and two intended failures: an unlocked session and old
plaintext survived replacement. The integrated app passes both. Nine UI cases
and six clipboard cases first failed against unimplemented owners, then passed.
The final browser suite passes 198/198, including real PRF/IndexedDB rich-record
save/reload/download/import/fake-GitHub cycles, same-revision different-key
replacement, a delayed Pull overtaken by a fresh unlock, both migration quota
failures, unsupported sibling viewing/source download, 320px light/dark
controls, keyboard focus, hidden/empty copies and clearing after lock. A tenth
UI case caught failed focus restoration after a committed save and failed
refresh; the repair passes. These are virtual-authenticator checks, not
real-hardware or independent security audit evidence.

Delivery evidence: `nix develop --quiet -c just ci`,
`nix flake check --no-eval-cache --print-build-logs`, `nix build .#site` and the
built-site smoke all exit 0. Both browser carriers pass 198/198; all changed app
modules pass checkJs and twelve abstract Lean theorems compile with standard
axioms only. The documentation presentation gate passes for the six changed
reader pages. The recovery diagram is source/render hash-bound, snapshotted and
visually checked at 1200px and 320px in light/dark; the mechanical layout check
passes and detects the deliberately oversized negative control. There is no
speech-reader surface in this project. Hosted CI and review are separate from
these local receipts; the feature is not merged or released by these checks.
