<!--
Sync Impact Report
- Version: 1.0.0 -> 1.1.0 (new principles and expanded specification gates).
- Modified: I. The record outranks the implementation; IV. Evidence before
  completion; Development workflow; Governance.
- Added: VI. Small modules with explicit ownership; VII. Private, extensible
  records without data loss; VIII. Safe, explicit field interactions.
- Removed: none.
- Templates updated: .specify/templates/plan-template.md;
  .specify/templates/spec-template.md; .specify/templates/tasks-template.md.
- Guidance updated: CONTRIBUTING.md; docs/development.md.
- Reviewed unchanged: README.md (current product behavior remains unchanged).
- Command templates: .specify/templates/commands/ is absent; command guidance
  remains in global Spec Kit skills, not duplicated in this repository.
- Deferred placeholders or follow-up TODOs: none.
-->

# fido2box Constitution

## Core Principles

### I. The record outranks the implementation

Docs, specifications, vision, and acceptance criteria outrank implementation.
Code is regenerable from a good record; the record is not regenerable from code.
Every PR ships user-facing documentation in the same diff. Write acceptance in
user-visible terms before code. When scope must be cut, cut implementation,
never the specification or acceptance record.

Feature specifications MUST state the user outcome, scope, non-goals, measurable
acceptance, and unresolved decisions before implementation. Separate WHAT and
WHY in the specification from HOW in the plan. Cite primary sources when
borrowing password-manager conventions; distinguish conventions from standards
and do not claim interoperability without a tested format contract.

### II. Small, inspectable cryptographic core

Keep cryptographic construction separate from WebAuthn, storage, networking, and
DOM code. Use browser-standard cryptography, no custom cipher or remote runtime
dependency. Preserve the correspondence between reviewed source and served app
files. Security claims must match demonstrated guarantees.

### III. Recovery compatibility and honest trust boundaries

Changes to the box format, key lifecycle, or RP ID require explicit
compatibility and migration plans. New-format success is insufficient if old
recovery material stops working. Document unresolved weaknesses, historical
exposure, rollback limits, origin trust, and clipboard limitations. Deployment
provenance and passing tests are not proof of cryptographic security.

### IV. Evidence before completion

Behavior fixes require a reproduction that fails before the fix. Test observable
outcomes and adversarial failures. Exercise the real browser with a virtual
authenticator, distinguish that from hardware tests, and fail when mandatory
coverage cannot run. Keep synthetic test secrets separate from production.

Every behavior change MUST have automated tests mapped to its acceptance
criteria. Bug fixes MUST demonstrate a failing regression before the fix and a
passing result after it. Documentation-only work MUST validate consistency,
formatting, and documentation builds; it does not require artificial behavior
tests. New or changed modules MUST participate in the repository's applicable
type, unit, and browser checks, not remain untested beside the checked core.

### V. Reproducible delivery

Pin tooling with Nix. Local and CI verification use the same checks and Just
recipes. Nix checks execute validation rather than merely building wrappers. CI
enters the developer shell and uses ephemeral GitHub-hosted Ubuntu runners, per
the maintainer's explicit decision. Fork PRs require workflow approval and run
without repository secrets; no checks depend on persistent runner state.

### VI. Small modules with explicit ownership

Each new or changed module MUST have one named responsibility and an explicit
public interface. Keep record modeling and validation, encryption, persistence,
networking, UI composition, and browser effects in separate owners. Pure domain
modules MUST NOT import DOM, clipboard, storage, or network code. UI
orchestration may depend on domain and effect modules, never the reverse.

Plans MUST identify new or changed module responsibilities and dependency
direction before modeling data or functions. Shared concepts belong to their
nearest stable common dependency, not duplicated across views or collected in a
generic utility module. Do not grow `app.js` with independent feature logic;
extract the responsibilities touched by the feature. Review cohesion and
interfaces rather than satisfying an arbitrary line-count limit. Unrelated
whole-application rewrites are not required.

### VII. Private, extensible records without data loss

Record titles, user-defined field labels, and field values MUST stay inside the
encrypted payload in durable storage, exports, and synchronization. Field kind,
semantic purpose, and display concealment are distinct concerns: masking a value
is a presentation choice, not an encryption or access-control boundary. Visible
fields receive the same encryption protection as hidden fields.

Any record-format change MUST define version detection, legacy reading,
migration/write behavior, and unsupported-data handling before implementation.
Preserve user values exactly unless normalization is explicitly specified.
Unknown data MUST be preserved losslessly or cause a clear refusal to modify the
record; never silently drop it. Prove old recovery fixtures remain readable and
new fields survive save, reload, export/import, and synchronization. Internal
service credentials MUST NOT become ordinary visible fields accidentally.

### VIII. Safe, explicit field interactions

Specs for fields MUST define display, conceal/reveal, editing, copying, and
navigation behavior independently. Treat labels and values as untrusted text,
never HTML. Navigation MUST pass the centralized URL policy; rejected schemes
must never become active links. Navigation and copying MUST be separate explicit
user actions. Copying MUST preserve the chosen value and must not reveal it in
status messages. Clipboard failure and best-effort clearing MUST be reported
honestly; do not promise clearing the browser cannot guarantee.

Controls MUST have accessible names, visible keyboard focus, and usable narrow
screen layouts. Masked values MUST NOT leak through labels, tooltips, or status
messages. Locking or leaving a record MUST reset temporary reveal state. Browser
tests MUST exercise these boundaries with synthetic data and malicious inputs.

## Domain constraints

Keep encrypted backups recoverable and private values out of logs and Git. The
production hostname is part of credential identity. Documentation on the same
origin is trusted executable content: keep assets local and dependencies pinned.
App and generated-site manifests identify what was published.

## Development workflow

Use issue-backed branches and reviewed PRs with specs, plans, and testable
tasks. Ratify the constitution before new feature specification. After
specification and clarification, planning MUST produce a modules model before
data and function models; tasks MUST map acceptance to implementation and
verification. Only model new or changed boundaries. The constitution check runs
before design and again before implementation. Missing decisions or
constitutional conflicts stop implementation until the record is clarified or
amended explicitly. Use Conventional Commits and green required checks. Preserve
signed history with merge commits; never use rebase merging. Release-please owns
version updates and release notes. Do not publish the private package to npm.

## Governance

Amend through a reviewed PR with rationale, affected acceptance criteria, and
migration consequences. Reviewers check these principles against both source and
documentation. Explicit user decisions govern scope; record exceptions.

The constitution is the project-wide governing record. Amendments MUST include a
Sync Impact Report and synchronize affected templates and guidance in the same
PR. Use MAJOR for incompatible governance changes or principle removals, MINOR
for new principles or materially expanded obligations, and PATCH for wording
clarifications. Keep the original ratification date and update the amendment
date and version. Compliance reviews MUST name any exception, its rationale,
scope, and validation; a silent implementation deviation is not an amendment.

**Version**: 1.1.0 | **Ratified**: 2026-10-07 | **Last Amended**: 2026-10-07
