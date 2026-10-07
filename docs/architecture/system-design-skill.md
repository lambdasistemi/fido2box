# Plan the formal design loop

As the person deciding how recovery should work, you should be able to play a
simulation and point out a wrong outcome without reading Lean. This plan
prepares fido2box for the existing **system-design** skill: your decisions
become an executable model, independently checked statements and proofs, and a
simulation built from that model.

**Status: preparation only.** No design team, Lean model, accepted theorem set,
mutation campaign, simulator, or independent audit has been commissioned by this
plan. The current app is described in [System design](system.md); proposed work
is tracked in the [design work plan](roadmap.md).

<!-- diagram: design-loop -->

## Use the existing skill

The entrypoint is `shared/skills/system-design/SKILL.md` in the maintained
`llm-settings` repository, available after the 2026-10-07 pull. It routes
creation to `system-design-creator` and independent review to
`system-design-auditor`. This is a plan to apply that workflow, not to create a
replacement skill.

The loop closes only when operator decisions, formal behavior, and the playable
simulation agree. A published prose plan, a compiling Lean file, or a green app
suite alone does not close it. Production conformance is a later handoff through
`code-the-design`, not something this documentation proves.

## Proposed first slice: replacing a box safely

The first candidate is the box-session lifecycle around Pull, unlock, editing,
and enrollment. The audit already supplies a concrete bad story: Alice unlocks
her local box, pulls a replacement with a new data key, then saves cached data
under the wrong session. The current app can lose remote changes or create an
unreadable box.

This candidate is bounded and directly blocks safe expressive-record delivery.
It does not settle key revocation, complete-file integrity, or authenticator
policy. PR #29's proposed session/store contracts are inputs to discuss, not
operator rulings merely because they were written down.

| Planning choice                                            | Alternative                                                          | Reason / status                                                                                                     |
| ---------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Start with replacement and stale operations                | Model the whole cryptographic and record system at once              | Proposed: concrete reachable failure and a narrow release dependency                                                |
| Model encrypted snapshots and session authority abstractly | Claim a Lean model proves browser cryptography                       | Proposed: isolate lifecycle guarantees; crypto/browser assumptions remain explicit                                  |
| Reuse the expressive-records planning record               | Author a second session/store plan                                   | Existing project constraint: avoid conflicting ownership and migration contracts                                    |
| Separate the model author from the simulator author        | Have one author explain the intended machine to the simulator author | Required by the skill's fresh-reader experiment; a single-author exception must state that this measurement is lost |

## Decisions before a model is frozen

The design owner records the operator's words verbatim, the precision added, and
any superseded ruling. Source behavior and an agent's proposal are evidence or
questions, never invented operator decisions.

The first unresolved user story is deliberately concrete: **a person has unsaved
edits when Pull would replace the box. What should happen to those edits?** The
constraint is that old plaintext or key material must not later commit over the
replacement. Record the answer before turning a proposed behavior into a
theorem.

Then take the remaining questions one at a time: what Lock invalidates while an
operation is pending; what a failed write leaves visible and recoverable; what
happens when enrollment finishes after replacement; and which encrypted snapshot
defines the source of a valid commit. Keep any unresolved guarantee visible in
the ledger.

## Staffing and authority

The current work prepares documentation. Execution of the formal loop needs an
explicit roster agreement: responsibilities, seat count including the existing
design owner, worker family/model/effort, concurrency and placement, audit
scope, and budget. A role recipe does not authorize dispatch. No workers have
been started for this plan.

The skill separates the design owner, creation dispatcher, Lean creator,
isolated simulation creator, and independent auditor. The roster can place
coordination on existing seats where allowed, but cannot silently drop audit or
treat the author as independent. Resolve any single-seat exception before work
starts and record its effect on the Lean-clarity experiment.

## Stage and evidence plan

| Stage              | Required artifact and exit evidence                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Freeze decisions   | Dated decision ledger, agreed slice and scope, ruling hashes, known assumptions, approved roster and bounded output paths                                                                                        |
| State the machine  | Lean state/actions, executable transition/refusal vocabulary, reachability/replay, and theorem statements; proofs visibly unfinished at this stage                                                               |
| Audit statements   | Fresh `system-design-auditor` selects statement/inversion paths; completeness in both directions, reachable antecedents and relevant falsifying mutants; only its accepted statement identity permits proof work |
| Prove and simulate | After statement acceptance, prove or constructively refute every theorem while an isolated creator builds the simulator from the stated Lean alone; keep a Lean-clarity record of every gap or guess             |
| Audit and play     | Fresh integrated audit of model/proofs, finite mutation coverage, simulator replay and negative controls; operator plays changed stories and records findings                                                    |
| Publish the slice  | Exact accepted Lean/proofs, simulation inside docs, and explanations deployed together; meaningful live bytes, navigation and story replay verified                                                              |
| Hand to production | Declare the executable oracle, JSON driver and accepted/refused corpus; map law and boundary observations into the constitution and `code-the-design` conformance work                                           |

A failed tactic is neither proof nor refutation. A constructive counterexample
returns to the operator when it exposes an ambiguous ruling; it never licenses
silently weakening a guarantee. Repairs reopen affected statements, proofs,
mutants, simulator properties and audits. The simulator need not wait for proof
completion after statement acceptance, so the operator can discover missing
choices early.

## Planned artifacts and boundaries

The eventual creator packet names exact paths and hashes. Candidate locations,
to confirm when freezing the slice, are:

- `docs/architecture/decisions.md`: operator rulings, dates and supersession.
- `lean/Fido2box/BoxSession.lean` and `BoxSessionGoals.lean`: machine and
  claims.
- A finite mutant ledger and machine-readable witness/refusal corpus under
  `lean/`, plus one JSON oracle driver.
- `LEAN-CLARITY.md`: what the isolated simulator creator could not derive from
  the Lean; no conversation explanation is substituted for the model.
- A simulator embedded in the documentation site, with its source/model digest,
  accessible controls, accepted and refused stories, and honest stage status.

These are planned locations, not existing files. The model will not establish
cryptographic primitive correctness, real-device support, IndexedDB semantics,
or production-code equivalence. Each boundary needs its own implementation and
operational evidence later.

## Ready to start, ready to close

Preparation is complete when the current system is documented, the first slice
and open user story are understandable, and the required inputs/roles/gates are
recorded. Starting the slice additionally needs the operator rulings and roster.

Closing the slice needs the skill's integrated audit, operator play, proved or
resolved-refuted obligations, source-bound simulation, oracle/corpus, and actual
publication. None of these is marked complete merely by merging this plan.
