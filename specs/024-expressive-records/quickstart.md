# Verification quickstart: Expressive recovery records

This is a future implementation acceptance recipe, not proof that new records
are already available. Use only synthetic data and localhost rehearsal keys.

## Current planning artifacts

Read plan.md, then modules-model.md, data-model.md, functions-model.md, and
contracts/. The requirements checklist records scenario traceability. Technical
planning is followed by task generation and consistency analysis; do not begin
behavior implementation directly from this page.

## Reproducible commands

```sh
nix develop --quiet -c just ci
nix flake check --no-eval-cache
nix build .#site
nix develop --quiet -c bash scripts/smoke-site.sh result
```

The current baseline has 23 core unit checks, 2 tooling checks, and 110 browser
checks. Counts must grow with coverage; never preserve these counts by dropping
old cases. Every new/changed JS owner, including app orchestration, enters
checkJs. Real-browser coverage uses the existing CDP harness and virtual PRF
authenticator. That is not a real-hardware interoperability test.

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
