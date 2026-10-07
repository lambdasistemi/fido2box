# Implementation Plan: Expressive recovery records

**Branch**: `feat/expressive-records` | **Date**: 2026-10-07 **Spec**:
[spec.md](spec.md) | **Issue**:
[#26](https://github.com/lambdasistemi/fido2box/issues/26) **Constitution**:
1.1.0 | **Feature ID**: 024-expressive-records

## Status

- Completed: specification merged in #25; read-only format/UI research; modules
  model authored before data/functions; compatibility and UI contracts.
- Current: solo delivery; approved plan merged in #29. See [tasks](tasks.md).
- Implemented: record codec, guarded storage/session owner, field editor and
  clipboard controller, with behavioral RED/GREEN evidence in tasks.md.
- Delivery checks pass; the operator explicitly waived independent review and
  authorized merge on 2026-10-07. Final-head CI remains a merge-guard condition.
- Feedback: no required URL; optional exact double entry and temporary reveal.
- The stale-Pull subset of
  [#16](https://github.com/lambdasistemi/fido2box/issues/16) has an actual-app
  regression and fix; the broader crypto audit remains open.

## Summary

Keep recovery records in small modules, separating pure model/format logic from
encryption, storage, UI composition, and browser effects. Add versioned
encrypted fields and explicit service records. Centralize every box mutation
behind a generation-bound session and atomic stored-source comparison. Back up
before migration; never imply older releases can safely edit the result.

## Technical Context

- **Language/Version**: existing ES2022 JavaScript modules with JSDoc/checkJs;
  Node 24 for tests, pinned TypeScript and Chromium through Nix.
- **Dependencies**: browser WebCrypto, WebAuthn PRF, IndexedDB, Clipboard and
  DOM; no new runtime library or build/bundling step.
- **Storage**: existing encrypted browser library and GitHub JSON files;
  separate encrypted pre-migration backup database, no durable plaintext.
- **Testing**: existing unit scripts and real-browser CDP harness with a virtual
  authenticator/fake GitHub; strict docs and served-site smoke.
- **Target**: existing compatible desktop/mobile browser environment and
  320-pixel layouts. No expanded browser/hardware support claim.
- **Project type**: static browser recovery application, no backend API.
- **Performance/scale**: SC-005's 20 fields and 10,000-character value are the
  required tested baseline; no new arbitrary cap or latency promise.
- **Constraints**: exact untouched values, recoverable legacy sources, no silent
  unknown-data loss, existing RP identity, hosted reproducible CI.

## Constitution Check

Initial review: all eight principles apply. Research questions were payload
detection, lossless legacy migration, downgrade limitations, backup durability,
effect ownership, stale completion fences, and multiline control normalization.
[Research](research.md) resolves these into the models/contracts below.

Post-design review (requirements/design compliance, not implementation
evidence):

- [x] Outcome, scope/non-goals and acceptance stay in spec; primary-source field
      conventions are distinguished from interoperability.
- [x] Modules model precedes data/functions and assigns effects to separate
      owners; pure modules have no DOM/storage/network imports. app remains
      composition.
- [x] All user metadata is encrypted; legacy and explicit service payloads have
      write rules; unknowns refuse mutation; migration requires a retained
      snapshot.
- [x] UI contract separates copy/reveal/navigation and specifies lock/reset,
      clipboard failure, accessible controls and narrow layouts.
- [x] Quickstart and requirements checklist define behavioral/adversarial
      evidence; all changed modules enter type/unit/browser checks as
      applicable.
- [x] No runtime dependency, crypto construction, origin, CI-runner, provenance,
      or Nix-toolchain change is proposed.
- [x] Before implementation: tasks and consistency analysis must cover I1–I6;
      formal state-transition obligations require proof/review per the design
      workflow.
- [ ] Before release: actual failure-then-success evidence for stale Pull and
      other touched failure paths, full acceptance tests, updated user guidance.

No constitutional exception is requested. Unchecked delivery gates are explicit
future work, not claimed completed by producing this plan.

## Project Structure

```text
specs/024-expressive-records/
  spec.md, plan.md, research.md, modules-model.md
  data-model.md, functions-model.md, quickstart.md
  contracts/record-format.md, contracts/ui.md
  checklists/requirements.md
  tasks.md                         (delivery checklist and proof/test mapping)
web/
  records.js, record-codec.js, box-format.js
  box-session.js, record-session.js, clipboard.js
  dom.js, record-view.js, record-editor.js
  crypto.js, store.js, github.js, webauthn.js, app.js  (changed owners)
  url.js                           (existing policy reused)
test/
  box.test.js, browser.test.js, tooling.test.cjs
```

**Structure decision**: flat local modules remain covered by the existing
runtime scanner and deployment enumeration. Do not add a framework, generic
utility bucket, nested unscanned runtime tree, or duplicate the specification in
code comments. New testing entry points, if needed, must be wired identically
into npm, Just, and Nix; prefer extending/splitting behind the existing entry
points.

## Design decisions

- Outer v3 and discriminated encrypted payloads; strict schema refusal instead
  of lossy projections or speculative future-version support.
- Full v1 note retained. Only documented v2 triples auto-convert; ambiguous data
  remains preserved and immutable. Blank-title provenance survives migration.
- Data-key wrapping/encryption unchanged; service-token type is encrypted and
  outside ordinary record views.
- Separate backup store avoids changing the existing library database version.
  Retain/read-verify backup before active CAS; no cross-database atomicity
  claim.
- Per-box session generations and write serialization prevent stale completions;
  compare complete source, never revision alone. All key/token edits use this
  gate.
- UI drafts preserve untouched strings. Deliberate value edits use browser
  control input, with explicit CR/CRLF-to-LF warning; no other normalization.
- Hidden values use inert masks, with separate Reveal/Replace. Copy works
  hidden. URL normalization is only for href; original value is stored/copied
  unchanged.
- Existing local source text is retained when available; older stored objects
  preserve all available encrypted members without a false byte-fidelity claim.

## Planned delivery sequence

These are dependency phases, not an implemented task list or unapproved epic
split.

1. Model/prove I1–I6 state transitions and map them to executable regression and
   property checks. Freeze legacy fixtures before replacing lossy parsing.
2. Reproduce/fix stale replacement and failed-save behavior through the shared
   session/store gate, covering deferred unlock/enrollment, same-revision
   different keys, and locked legacy key mutation. Keep issue #16 scope
   explicit.
3. Integrate format/domain/backup boundaries with record, token, and key
   consumers. All callers change together; no intermediate writer may drop new
   fields.
4. Add the user-visible editor/view, clipboard owner, and route lifecycle; wire
   new modules into checks and preserve existing help/theme behavior.
5. Complete migration/round-trip/adversarial/browser evidence and user guidance;
   enable release only once all spec scenarios and guard regressions pass.

The task phase should propose one bisect-safe feature PR unless evidence
requires a split; do not create an epic without maintainer approval.

## Validation and handoff

Planning changes: formatting, strict docs build, relative-link/placeholder and
cross-model checks, independent design review, plus unchanged baseline CI.
Behavior delivery: quickstart acceptance, full `just ci`, flake checks,
built-site smoke, and actual CI. Include served new module assets in smoke
checks.

Proof tooling uses Lean 4.25 from the existing locked docs nixpkgs input. No
`update-agent-context.sh` is installed in this repository; conditional
invocation confirmed absence. There is no new technology to record, so no
replacement agent configuration is invented. No planning hooks are configured.

Planning artifact ceilings: plan 170 lines; research 140; modules 180; data 250;
functions 230; each contract 100; quickstart 100. Record actual lines/bytes in
the PR evidence. These are ceilings, not targets or model-token estimates.

## Complexity Tracking

No exception. Each new owner corresponds to a constitutional boundary or a
shared consumer need; supporting models own detail so this plan stays compact.
