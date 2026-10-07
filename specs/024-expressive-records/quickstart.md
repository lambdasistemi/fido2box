# Verification quickstart: Expressive recovery records

This is the acceptance recipe for the implementation in PR #33. Executed
evidence is recorded in tasks.md. Use only synthetic data and localhost
rehearsal keys.

## Design and evidence

Read plan.md, then modules-model.md, data-model.md, functions-model.md, and
contracts/. The requirements checklist records scenario traceability; tasks.md
distinguishes executed implementation checks from review and release decisions.

## Reproducible commands

```sh
nix develop --quiet -c just ci
nix flake check --no-eval-cache
nix build .#site
nix develop --quiet -c bash scripts/smoke-site.sh result
```

The suite includes core, record/codec, envelope, frozen legacy, clipboard and
GitHub source checks, tooling guards, and 198 browser checks. Every new/changed
JS owner, including app orchestration, enters checkJs. Real-browser coverage
uses the existing CDP harness and virtual PRF authenticator. That is not a
real-hardware interoperability test.

## Recovery acceptance

1. Create a titled record with Account, two Website fields, hidden recovery key,
   hidden multiline codes, Notes, and duplicate-name custom fields. Also test
   zero fields, empty values, and the 20-field/10,000-character baseline. A
   secret-only record and an empty Website must save without an address error.
2. Rename/change kind/change hiding/remove/undo/cancel/save. Compare exact
   stored strings and order after lock/reload/unlock; use CR/LF/CRLF and Unicode
   fixtures.
3. Copy every field, including hidden/empty; follow visible URLs. Verify no Open
   button, no navigation on Copy, and no secret in hidden DOM or feedback.
4. Deny clipboard access; exercise 60-second conditional clearing, changed
   external clipboard content, failed subsequent copy, and lock during delayed
   completion.
5. Use keyboard only and 320-pixel layouts in both themes. Check focus
   restoration and dirty-draft guards for tab/record/hash changes and browser
   Back/Forward.
6. Type and reveal/re-hide a new secret. Enable optional confirmation: it starts
   empty, checks exact equality after either edit, and can be disabled. Test
   whitespace/newline mismatches, independent reveal, keyboard/phone controls,
   removal/undo, and no confirmation in saved/exported data or after lock.

## Compatibility and failure acceptance

1. Import fixed pre-change v1/v2 fixtures and legacy token material.
   Read/download without migration; retain full note, untitled title,
   empty/missing fields, token URL.
2. On first edit, verify migration warning and downloadable encrypted snapshot.
   Deny backup storage and deny active storage independently; neither loses
   source.
3. Export/import and push/pull rich records through the real UI with fake
   GitHub. Pull a different-key box with the same revision; saved content must
   remain decryptable only through the replacement's intended wrappers.
4. Delay unlock/enrollment/encryption/storage, then lock or Pull. Late
   operations cannot restore plaintext or overwrite a replacement. Include
   another-tab CAS conflict and a successful storage write followed by failed UI
   refresh.
5. Try unknown versions/members/kinds, malformed and forged payloads, duplicate
   IDs, and mixed supported/unsupported boxes. Exercise record, token, and key
   mutations, including locked v1 key removal. Saved sources remain unchanged.
6. Reopen/download retained backups after migration and active-box deletion.
   Verify plaintext absence in library, backup store, exports, and network
   bodies.
7. Check old-writer behavior with pre-change fixtures/parser as a negative
   compatibility test. Do not claim safe downgrade or recovery of later edits.

## Delivery boundary

Map each spec scenario and data invariant to tasks and evidence. The stale-Pull
subset of #16 must be fixed and verified before feature release; the other audit
findings remain disclosed. Update in-app guidance, README, recovery/security
docs, and comparison's planned/current wording only when behavior ships.
