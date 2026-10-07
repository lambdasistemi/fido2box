# Specification Quality Checklist: Expressive recovery records

**Purpose**: Validate the specification before technical planning.

**Created**: 2026-10-07

**Feature**: [Expressive recovery records](../spec.md)

## Content Quality

- [x] CHK001 No implementation code, schema, framework, or module design.
- [x] CHK002 Focused on recovering accounts and retaining recovery material.
- [x] CHK003 User stories and outcomes are understandable without code context.
- [x] CHK004 All mandatory template sections completed.

## Requirement Completeness

- [x] CHK005 No unresolved clarification markers or template placeholders.
- [x] CHK006 Requirements identify observable success and refusal behavior.
- [x] CHK007 Success criteria have measurable fixture-based outcomes.
- [x] CHK008 Success criteria do not mandate implementation technologies.
- [x] CHK009 Acceptance scenarios cover creation, editing, use, and recovery.
- [x] CHK010 Edge cases include empty/duplicate fields, unsafe content, and
      failures.
- [x] CHK011 Recovery-first scope and explicit non-goals bound the feature.
- [x] CHK012 Assumptions and the stale-Pull release dependency are identified.

## Feature Readiness

- [x] CHK013 Functional requirements map to acceptance scenarios or delivery
      checks.
- [x] CHK014 Scenarios cover all primary user flows, including legacy recovery.
- [x] CHK015 Defined outcomes can demonstrate feature acceptance after
      implementation.
- [x] CHK016 Module and format decisions are explicitly left to planning.
- [x] CHK017 Field conventions cite primary sources without claiming
      interoperability.
- [x] CHK018 Concealment, copy, and navigation are independent, testable
      actions.
- [x] CHK019 Existing crypto weaknesses are not presented as solved.

## Review Notes

This is a requirements-quality checklist, not proof of implemented behavior. No
feature acceptance test has passed yet because implementation has not begun.

Independent review found a conflict between required new titles and untitled
legacy records. Story 3.1 and FR-001/FR-003 now explicitly allow an unchanged
blank legacy title during editing or migration; only new or explicitly renamed
titles require a nonblank value. Include an untitled legacy fixture in planning.

Traceability for planning:

| Requirement           | Acceptance evidence to produce during implementation                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001–FR-003         | Story 1, including blank names, duplicate labels, empty values, suggestions, and cancelled edits                                                                 |
| FR-004                | Story 2.1 and 2.4; exact copied text and denied clipboard operations                                                                                             |
| FR-005                | Story 2.2–2.3; malicious and malformed address cases, no opener/referrer, no Open button                                                                         |
| FR-006                | Story 2.3 and 2.5; text resembling a URL stays text, hidden values do not leak via labels/tooltips                                                               |
| FR-007                | Stories 1.1 and 3.3; full field-attribute comparisons for each round trip                                                                                        |
| FR-008                | Stories 3.1–3.2; original legacy notes preserved in full                                                                                                         |
| FR-009                | Story 3.4; unknown and malformed records cannot trigger destructive saves                                                                                        |
| FR-010                | Story 3.5; internal token stays usable and hidden, reserved-title collisions refused                                                                             |
| FR-011                | Story 2 and SC-004; labelled controls, keyboard focus, and narrow layouts                                                                                        |
| FR-012                | Updated user guide checked against shipped field behavior; strict documentation build                                                                            |
| Privacy and clipboard | Encrypted outputs contain no synthetic plaintext; one-minute clearing, changed-clipboard protection, and clearing failure evidence                               |
| Migration and editing | Pre-migration backup and downgrade warning; no rewrite on view, unsafe mutation refusal, unsaved-change confirmation, undo before save, failed-save preservation |
| SC-005                | Full lifecycle with 20 fields and a 10,000-character value; explicit over-limit refusal if a limit is introduced                                                 |

Next phase: technical planning, starting with module responsibilities. The
stale-Pull issue blocks release, not writing the design. Resolve that dependency
before claiming the recovery acceptance scenarios pass.
