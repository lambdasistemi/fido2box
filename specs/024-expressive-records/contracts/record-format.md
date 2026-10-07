# Record-format and migration contract

Canonical members/types are in [data-model.md](../data-model.md), D1–D5. This
contract fixes externally observable compatibility, not a third-party
interchange promise.

## Compatibility matrix

| Input                                                   | Read / use                                                         | Write                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------- |
| Supported v1 note                                       | Full original note, hidden multiline                               | Explicit migration to v3 after backup |
| Supported v2 triple                                     | Exact title, optional URL, hidden secret                           | Explicit migration to v3 after backup |
| Legacy reserved-title token                             | Sync only, never ordinary fields                                   | Explicit service payload after backup |
| Supported v3 payloads                                   | All modeled fields and service behavior                            | v3, same wrapping construction        |
| Unknown envelope/payload/member or ambiguous v2 content | Encrypted source download; supported sibling records may be viewed | Refuse whole-box mutation             |
| Invalid JSON from import                                | Visible non-secret rejection; selected file unchanged              | No library replacement                |
| Ciphertext authentication failure                       | Non-secret error; retained encrypted source                        | No editable session                   |

All content, key, and token edits share this write rule. Locked key removal no
longer bypasses validation: unlock first. Viewing/unlocking/copying/download,
file import, and Pull do not migrate. Push uploads retained encrypted source; it
never manufactures a revision or reserializes unknown local data. Push refuses
malformed/unknown remote envelopes; it does not claim to validate remote
encrypted payloads without decrypting them.

## First format-changing mutation

The user sees the source format, lossless conversion summary, and a warning:
older fido2box releases cannot safely edit the result. Confirmation applies to
that exact source only. A retained, read-verified encrypted backup is required;
failure prevents the active write. Sync offers Download pre-migration backup
even after active-box deletion and permits export under a distinct filename. The
Boxes view lists retained backups globally, including deleted box names.

The original key wrappers and data key are retained; adding/removing keys
follows the existing limitations. Successful mutation increments revision once.
Merely creating/reading a backup does not change the active box. A source
conflict requires fresh unlock and fresh approval, not an automatic overwrite or
retry.

Retain source text when available. For preexisting browser entries only the
parsed encrypted object exists, so backup preserves all available members but
cannot recover original whitespace. New source-text storage adds no plaintext.

## Downgrade and recovery warnings

A v3 marker makes intent explicit, not safe rollback. The old GitHub Pull path
accepts unfamiliar versions and older writers may destroy new fields. The
pre-migration snapshot recovers only pre-migration data, not later edits.
Backups in the browser are not independent of browser-data loss; download a
copy.

No change to the cryptographic construction, outer metadata authentication,
historical-key revocation, or authenticator hardware enforcement is claimed.
Issue #16 remains open apart from any separately verified stale-state fix.

## Required compatibility evidence

Retain fixed synthetic v1/v2 fixtures before replacing lossy parsing; include
whole-note JSON-looking content, empty/untitled records, original token URL,
spaces, leading zeros, CR/LF/CRLF, duplicate field names, and empty values.
Current-format fixtures include duplicate IDs, unknown members at every level,
unknown versions/kinds, wrong scalar types, invalid base64, and tampered
ciphertext. Test every mutation route, not only record Save. New and legacy
round trips must show exact untouched strings and encrypted absence of
titles/labels/values.

Known deliberate editing behavior: browser textarea input uses normalized LF.
Untouched imported CR/CRLF values, including a revealed-but-unedited value,
remain exact. Editing such a value shows a warning and replaces only that value
with the user's control input. URL normalization is navigation-only.
