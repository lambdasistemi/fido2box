# System design work plan

As a maintainer planning the next recovery change, use this page to identify
which decisions and evidence must precede implementation.

<!-- diagram: design-roadmap -->

This is the design backlog for the [current architecture](system.md), not a
claim that its proposed guarantees are already implemented. The constitution's
modules-first planning order remains authoritative.

## Existing records to preserve

| Record                                                                                                                          | Status at this design baseline              | Role                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [Constitution 1.1.0](https://github.com/lambdasistemi/fido2box/blob/4d19422/.specify/memory/constitution.md)                    | Ratified                                    | Compatibility, privacy, ownership and verification rules                                    |
| [Audit #16](https://github.com/lambdasistemi/fido2box/issues/16)                                                                | Open                                        | Four concrete failures/limitations with acceptance criteria                                 |
| [Expressive-records specification](https://github.com/lambdasistemi/fido2box/blob/4d19422/specs/024-expressive-records/spec.md) | Merged specification; feature unimplemented | User outcome and acceptance for richer encrypted records                                    |
| [Expressive-records plan, PR #29](https://github.com/lambdasistemi/fido2box/pull/29)                                            | Merged plan; feature unimplemented          | Module, data, function and compatibility contracts; extend these rather than duplicate them |
| [Identification flow, PR #30](https://github.com/lambdasistemi/fido2box/pull/30)                                                | Implemented                                 | Known-credential reuse, optional nicknames, and recognition from locked metadata            |

Refresh these statuses when starting implementation. A PR number or design
proposal is not evidence that its behavior has landed.

## Order of work

1. **Agree on boundaries and decisions.** Use the current source map and issue
   #16 counterexamples. Reconcile key recognition from PR #30 with PR #29's
   proposed session/store boundary. Record new decisions next to the owning
   feature contracts.
2. **Make state replacement safe.** Design and reproduce stale Pull, delayed
   unlock/enrollment, failed saves, and same-revision replacement. Define the
   generation and atomic stored-source comparison needed by every writer. This
   is a dependency of rich-record release, not the entire audit fix.
3. **Finalize expressive-record contracts.** Build on PR #29's module model
   before data/functions. Resolve migration, unknown-data refusal/preservation,
   service-token separation, and backup-before-write behavior. Then generate
   acceptance-linked tasks and cross-artifact consistency analysis.
4. **Specify integrity, revocation, and authenticator policy separately.** These
   have different compatibility and operational costs. Do not hide them inside
   an unrelated record/UI implementation or treat them as solved by step 2.
5. **Implement bounded slices only after the records agree.** Tie every changed
   boundary to regression evidence and user documentation. Validate old recovery
   material, exports/imports, GitHub round trips, and narrow-screen interactions
   before release.

No implementation or Lean proof is supplied by this documentation change. Where
the design workflow requires formalization, the following obligations are its
inputs—not invented theorem names or claimed proofs.

## Decisions and required evidence

| Decision name        | Decision / owner                                                                                 | Required evidence before claiming the result                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Safe replacement     | Box-session and store owners: what invalidates an unlocked session, and what serializes commits? | Stale-Pull reproducer; replacement with a different data key; deferred operations rejected after replacement/lock; failed storage leaves recoverable state                                  |
| Lossless migration   | Record/codec owners in PR #29: version and lossless migration contract                           | Frozen v1/v2 fixtures; exact untouched values; unknown data preserved or mutation refused; verified backup retained before active replacement; honest downgrade behavior                    |
| Whole-box integrity  | Crypto/format owners: what authenticates collection, metadata and box identity?                  | Reject dropped/duplicated/substituted records and altered metadata; document that valid whole-vault replay needs external trusted freshness state                                           |
| Key revocation       | Key-lifecycle owner: removal versus real revocation                                              | Fresh data key and wrappers only for retained keys; old wrapper cannot decrypt post-rotation contents; interruption/recovery plan when a retained key is unavailable                        |
| Authenticator policy | Authenticator owner: supported policy and wording                                                | Explicit support/rejection tests; distinguish user verification from PIN and roaming attachment from verified hardware/non-exportability; real-device evidence for advertised compatibility |
| Key recognition      | Key-catalog and UI owners: how to handle legacy aliases and missing backups?                     | Recognition works while boxes are locked; absent metadata and cancellation stay inconclusive; no name-based identity merge; current credential-reuse behavior survives extraction           |
| Origin recovery      | Deployment owner: how is trusted code restored on the original origin?                           | Built artifact smoke and provenance verification; documented domain retention and recovery runbook; no claim that provenance neutralizes an origin compromise                               |

Safe replacement and lossless migration are coupled through the write path.
Whole-box integrity may require a future format change; do not finalize a
compatibility promise without reviewing it alongside lossless migration. Key
revocation needs an explicit operator ceremony, not only a crypto helper.
Authenticator policy changes which recovery devices are accepted and must
account for existing credentials.

## State-machine obligations

Model an encrypted stored snapshot separately from the unlocked session, pending
operations, and drafts. Candidate transitions are Unlock, Edit, Save, Replace,
Lock, Enroll, Remove, and Migrate. The proposal should make these claims
precise:

- An operation bound to an old session/snapshot cannot commit after replacement
  or lock. A successful write corresponds to the source it validated.
- Failed writes do not discard the last recoverable encrypted source or publish
  a successful UI state. Backup retention precedes migration replacement.
- Unsupported records cannot be silently projected into a smaller payload by any
  writer, including token and key edits.
- Ordinary user-field rendering cannot expose service credentials; locking and
  route changes reset temporary reveal state according to the feature contract.
- Recognition and enrollment are different transitions: an inconclusive
  recognition creates neither a new identity nor an enrolled key.

An abstract proof can establish transition preservation for the model; it does
not prove WebAuthn, AES-GCM, IndexedDB, browser rendering, or physical hardware.
Map each modeled transition to its implementation owner and executable tests.
Name that correspondence before reporting a proof as relevant to the app.

## Delivery gates

A design handoff is ready when module ownership, data contracts, state
transitions, unresolved decisions, compatibility consequences, and acceptance
agree. Missing decisions remain explicit blockers for the affected slice.

A behavior handoff additionally needs observed regression failures before the
fix, acceptance tests after it, applicable type/unit/browser checks, full local
CI and Nix checks, and built-site verification. Do not interpret “design-ready”
as “safe to deploy.” Documentation-only changes need consistency, formatting,
strict build, and link checks, not artificial product tests.

The [system-design skill plan](system-design-skill.md) describes how to make the
first bounded formal slice reviewable through operator rulings, an audited model
and a playable simulation.
