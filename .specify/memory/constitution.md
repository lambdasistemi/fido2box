# fido2box Constitution

## Core Principles

### I. The record outranks the implementation

Docs, specifications, vision, and acceptance criteria outrank implementation.
Code is regenerable from a good record; the record is not regenerable from code.
Every PR ships user-facing documentation in the same diff. Write acceptance in
user-visible terms before code. When scope must be cut, cut implementation,
never the specification or acceptance record.

### II. Small, inspectable cryptographic core

Keep cryptographic construction separate from WebAuthn, storage, networking, and
DOM code. Use browser-standard cryptography, no custom cipher or remote runtime
dependency. Preserve the correspondence between reviewed source and served app
files. Security claims must match demonstrated guarantees.

### III. Recovery compatibility and honest trust boundaries

Changes to the box format, key lifecycle, or RP ID require explicit compatibility
and migration plans. New-format success is insufficient if old recovery material
stops working. Document unresolved weaknesses, historical exposure, rollback
limits, origin trust, and clipboard limitations. Deployment provenance and
passing tests are not proof of cryptographic security.

### IV. Evidence before completion

Behavior fixes require a reproduction that fails before the fix. Test observable
outcomes and adversarial failures. Exercise the real browser with a virtual
authenticator, distinguish that from hardware tests, and fail when mandatory
coverage cannot run. Keep synthetic test secrets separate from production.

### V. Reproducible delivery

Pin tooling with Nix. Local and CI verification use the same checks and Just
recipes. Nix checks execute validation rather than merely building wrappers.
CI enters the developer shell and uses ephemeral GitHub-hosted Ubuntu runners,
per the maintainer's explicit decision. Fork PRs require workflow approval and
run without repository secrets; no checks depend on persistent runner state.

## Domain constraints

Keep encrypted backups recoverable and private values out of logs and Git.
The production hostname is part of credential identity. Documentation on the
same origin is trusted executable content: keep assets local and dependencies
pinned. App and generated-site manifests identify what was published.

## Development workflow

Use issue-backed branches and reviewed PRs with specs, plans, and testable tasks.
Use Conventional Commits and green required checks. Preserve signed history with
merge commits; never use rebase merging. Release-please owns version updates and
release notes. Do not publish the private package to npm.

## Governance

Amend through a reviewed PR with rationale, affected acceptance criteria, and
migration consequences. Reviewers check these principles against both source
and documentation. Explicit user decisions govern scope; record exceptions.

**Version**: 1.0.0 | **Ratified**: 2026-10-07 | **Last Amended**: 2026-10-07
