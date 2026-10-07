# Feature Specification: Expressive recovery records

**Feature Branch**: `docs/expressive-records`

**Feature ID**: `024-expressive-records`

**Implementation tracking**:
[issue #26](https://github.com/lambdasistemi/fido2box/issues/26)

**Created**: 2026-10-07

**Status**: Implemented in PR #33; final checks and deferred review decision
tracked in tasks.md

**Input**: Named user-added fields, hidden or visible; URLs are links instead of
an Open button; each value has a copy button. Keep code in small, focused
modules. Preserve the recovery-first purpose rather than recreate Bitwarden.

**Constitution**: [version 1.1.0](../../.specify/memory/constitution.md),
ratified before this specification in PR #24.

## Scope and Non-goals _(mandatory)_

A box owner can keep the information needed to recover an account together: an
account identifier, recovery key, backup codes, relevant addresses, and
instructions. A record is no longer restricted to one address and one secret.
The product remains a small recovery kit: encrypted files, an enrolled
authenticator, and a static application, without a fido2box account or backend.

In scope: creating and editing named fields, independent concealment, safe
navigation, exact copying, and lossless recovery through existing box workflows.
The implementation must meet the constitution's small-module requirements;
module boundaries and format design belong to the subsequent plan.

Non-goals:

- Autofill, browser extensions, password generation, or daily-login automation.
- TOTP generation, passkey storage, attachments, and executable field formulas.
- Third-party vault import/export or credential-exchange interoperability.
- Sharing, organizational permissions, new synchronization providers, or
  accounts.
- A whole-application rewrite or a claim to resolve every crypto audit finding.
- Drag-and-drop ordering, record categories, or a general template builder.

### Field conventions and source findings

These are product conventions, not a universal password-manager field standard.
Sources were checked on 2026-10-07.

| Source                                                      | Relevant convention                                                                               | Decision for recovery records                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [KeePass](https://keepass.info/help/base/placeholders.html) | Title, username, password, URL, notes, and custom strings                                         | Use familiar labels without requiring a password or address.                 |
| [Bitwarden](https://bitwarden.com/help/custom-fields/)      | Named values with text, hidden, checkbox, and linked field types                                  | Support named text values and concealment; defer booleans and linked values. |
| [1Password](https://www.1password.dev/cli/item-fields)      | Field types distinguish text, concealed values, URLs, and email; labels and purposes are distinct | Separate a value's kind, suggested purpose, and concealment.                 |

Offer optional starting fields: Account (text, visible), Password or recovery
key (text, hidden), Website (URL, visible), Backup codes (multiline, hidden),
and Notes (multiline, visible). These are removable suggestions, not required
fields or inferred access permissions. Email identifiers use text. A custom
field has a user-chosen name, one of text/multiline/URL, and a hidden toggle;
custom fields start hidden. Multiple fields of the same kind are allowed.

## User Scenarios & Testing _(mandatory)_

The scenarios below are requirements for future automated tests, not claims that
the feature exists. This specification-only delivery checks consistency,
formatting, and the strict documentation build; implementation must map every
scenario to automated evidence before release.

### User Story 1 - Keep a complete recovery record (Priority: P1)

As a box owner, I save a recovery record and observe all its named values
restored intact when I reopen the box.

**Why this priority**: A recovery kit is only useful if it retains everything
needed after devices or sessions are lost.

**Independent Test**: Create a record containing Account, two URLs, a recovery
key, multiline backup codes, and custom instructions; save, lock, reload, and
unlock it using an enrolled test authenticator.

**Acceptance Scenarios**:

1. **Given** an unlocked box, **When** I save that record, **Then** its title,
   field names, kinds, ordering, hiding choices, and exact values survive
   reload.
2. **Given** a saved record, **When** I rename a field, change its kind or
   hiding choice, or remove a field and save, **Then** only the intended data
   changes; cancelling the edit leaves the saved record unchanged.
3. **Given** a new record, **When** it contains only named recovery instructions
   and no URL or password, **Then** it saves successfully. Empty field values
   are retained; blank titles or field names fail with an associated error. In
   particular, a secret-only record and a record with an empty Website field
   save and reopen without the old required-address error; neither creates a
   link.
4. **Given** two fields with the same label, **When** I edit, remove, or copy
   one, **Then** the other remains unchanged and controls identify their field
   by its position as well as its label.

### User Story 2 - Use a field without exposing others (Priority: P1)

As a person recovering an account, I copy a chosen value or follow a chosen
address without revealing unrelated secrets.

**Why this priority**: Recovery often happens on an unfamiliar screen; copy,
reveal, and navigation must be distinct deliberate actions.

**Independent Test**: Open a fixture record with visible text, hidden multiline
codes, and visible and hidden URLs; exercise each action independently.

**Acceptance Scenarios**:

1. **Given** any field, including an empty or concealed one, **When** I activate
   its copy button, **Then** the exact stored value is copied, without
   navigation or changing concealment. Leading zeros, spaces, and line breaks
   are retained.
2. **Given** a permitted visible URL field, **When** I activate the value
   itself, **Then** it opens in a separate browsing context without access to
   the recovery page or a referrer. No separate Open button remains; copying
   does not open it.
3. **Given** a hidden URL, **When** the record opens, **Then** its value is
   masked with no active link or URL in tooltips or accessible names. Explicit
   Reveal permits navigation; Hide, leaving the record, or locking resets reveal
   state.

4. **Given** a secret being created or replaced, **When** I type, **Then** I can
   Show or Hide the entry without changing its saved concealment setting.
   Optional double entry is off by default. Enabling it creates an empty,
   independently revealable confirmation; it never copies the first value.
5. **Given** enabled double entry, **When** either entry changes, **Then** Save
   requires exact equality, including spaces and line breaks, with a non-secret
   mismatch message. I can correct either entry or disable confirmation. Save,
   Cancel, field removal, departure, and lock clear confirmation and reveal
   state; confirmation is never stored, exported, or synchronized.
6. **Given** a denied clipboard operation, **When** I copy, **Then** failure is
   announced without the value and without claiming success. On successful copy,
   guidance describes clearing as best effort, not guaranteed erasure.
7. **Given** a concealed field in an existing record, **When** I enter editing,
   **Then** it stays concealed until I deliberately reveal or replace its value;
   saving or cancelling closes editing without persisting temporary reveal
   state.

### User Story 3 - Recover old and new boxes safely (Priority: P1)

As a box owner with saved recovery material, I reopen an old or transferred box
and observe no lost fields or silently overwritten information.

**Why this priority**: A richer editor must not invalidate the recovery material
the application already exists to protect.

**Independent Test**: Use published legacy fixtures and a new multi-field
fixture through download/import and GitHub push/pull, then edit, save, and
unlock again.

**Acceptance Scenarios**:

1. **Given** a legacy title/address/secret record, **When** I open and save it,
   **Then** the title and both values remain exact, the address becomes a URL
   field, and the secret is hidden. For documented v2 triples, secret is
   required; a missing title or URL remains absent or empty, without fabricated
   credentials or forced new values. A purported v2 triple without a string
   secret is unsupported and follows scenario 3.4. An existing blank title may
   remain unchanged through edits and migration; an Untitled display label is
   not persisted as a replacement. Explicitly renaming it requires a nonblank
   title, as does creating a new record.
2. **Given** a legacy plaintext note, **When** I recover it, **Then** the whole
   original note remains available in a hidden multiline field. Any extracted
   recovery key is additional information, never a replacement for that note.
3. **Given** new records, **When** I export/import or push/pull and reopen them,
   **Then** every field and its attributes survives unchanged. Pull cannot leave
   stale editable plaintext or a stale encryption key associated with the new
   box.
4. **Given** unsupported record data or a malformed field, **When** I attempt a
   mutation, **Then** it is refused before changing the saved box, with an
   explanation and access to the original encrypted download. No data is
   dropped.
5. **Given** an internal GitHub token, **When** I edit records or sync, **Then**
   it remains encrypted and usable for sync but absent from ordinary record
   fields.

### Edge Cases

- Literal markup, scripts, URL credentials, mixed-case schemes, malformed URLs,
  and long unbroken values must not execute code or bypass navigation policy.
- Changing kind or concealment does not normalize, coerce, or truncate a value.
- Duplicate field labels remain distinct; an empty value is not a deleted field.
- Cancelling edits or a failed save keeps the last saved record intact; locking
  discards unsaved plaintext rather than persisting a plaintext draft.
- Removing a field affects only the draft until Save; removal must offer an
  immediate way to undo it before saving. Losing an unsaved draft on navigation
  requires confirmation, except an explicit security lock.
- Unknown formats are never reinterpreted as legacy plaintext just because their
  structure is unrecognized. Opening or downloading them must not rewrite them.
- At 320 CSS pixels and by keyboard alone, long content does not push copy,
  reveal, or editing controls off the page.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Require a title for new records and provide an ordered collection
  of zero or more named fields; allow adding, editing, and removing fields
  (Story 1). Preserve unchanged blank legacy titles under Story 3.1's exception.
- **FR-002**: Support text, multiline, and URL kinds with independent
  concealment; preserve insertion order and duplicate labels (Stories 1.1–1.4).
- **FR-003**: Provide the optional field suggestions above, without requiring
  any particular field; preserve empty values and reject whitespace-only field
  names and new or explicitly renamed titles without silently trimming accepted
  content (Story 1.3 and Story 3.1).
- **FR-004**: Give every field value its own accessible copy control, including
  hidden and empty values; copy stored text without transformations (Story 2.1).
- **FR-005**: Render permitted, unmasked URL values as links; remove Open
  buttons. Only HTTPS, or HTTP with hostname exactly localhost or 127.0.0.1 for
  rehearsal, may navigate. Other values remain copyable text with an
  invalid-address notice; they may be stored for recovery but never activated
  (Story 2.2, edge cases).
- **FR-006**: Conceal hidden values by default in viewing and editing; make
  revealing local and temporary. Plain text that resembles a URL is not
  automatically linked (Stories 2.3 and 2.5).
- **FR-007**: Preserve stored values, labels, kinds, order, and concealment
  across save/reload, export/import, and synchronization (Stories 1.1 and 3.3).
- **FR-008**: Read existing legacy fixtures without losing original recovery
  material; do not mutate boxes merely by viewing them (Stories 3.1 and 3.2).
- **FR-009**: Refuse edits to unsupported or malformed record data without
  rewriting it, while preserving the original encrypted export (Story 3.4).
- **FR-010**: Preserve internal token behavior. Reject creation or renaming of a
  user record to an internal reserved title with a clear error, rather than
  treating user data as a service credential (Story 3.5).
- **FR-011**: Provide labelled controls, visible keyboard focus, non-secret
  status announcements, and usable 320-pixel layouts (Story 2 and edge cases).
- **FR-012**: Update the user guide in the implementation delivery to explain
  field kinds, hiding, links, copying, migration, and recovery limitations.
- **Optional secret confirmation**: Offer Show/Hide during secret entry and
  optional exact double entry, following Stories 2.6–2.7. Confirmation is
  transient editor state, never a second persisted field or a mandatory step.

### Privacy, Recovery, and Interaction Requirements _(mandatory assessment)_

Titles, field labels, kinds, values, order, and hiding settings belong inside
the encrypted record in durable storage, exports, and synchronization. Visible
fields receive the same protection as hidden ones. Masking does not protect
against a compromised browser, trusted page code, or someone with unlock access.
Render labels and values as literal text; never interpret them as markup.

Copy feedback must not include the copied value. Attempt clearing after one
minute only if the clipboard still contains this application's copied value; do
not replace different subsequent clipboard content. Report denied clearing
honestly. Closing the page, browser restrictions, clipboard history, and other
applications make reliable erasure impossible.

Format planning must define new/legacy detection, explicit write migration,
unsupported-data refusal, and downgrade limits. Do not claim older releases can
safely edit new records; warn users and retain a pre-migration encrypted backup
before the first format-changing save. Editing a supported record must refuse to
save the box if doing so would discard another unsupported record.

Known audit findings remain documented in
[issue #16](https://github.com/lambdasistemi/fido2box/issues/16). The
stale-state-after-Pull finding blocks feature release until its fix and the
Story 3.3 regression are verified. Broader key revocation, vault integrity, and
hardware-only enforcement are not solved or newly claimed by this feature.

### Key Entities _(include if feature involves data)_

- **Recovery record**: A title and independently identifiable, ordered fields
  inside a box; distinct from internal service credentials.
- **Field**: A name, exact text value, presentation kind, and persistent hiding
  choice; its suggested purpose does not define encryption or access rights.
- **Editing session**: Unsaved changes and temporary reveal choices, discarded
  on cancel or lock; not a new durable plaintext store.
- **Legacy recovery material**: Existing encrypted records or notes whose
  original values must survive reading and any approved migration.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A recovery fixture containing Account, two URLs, a recovery key,
  multiline backup codes, and custom instructions completes every Story 1 and
  Story 3 round trip with zero lost or changed values or field attributes.
- **SC-002**: Every field in the test fixtures can be copied with one activation
  without revealing it first; every permitted visible URL needs one activation
  to navigate and has no separate Open control.
- **SC-003**: All published legacy recovery fixtures remain recoverable; all
  unsupported-format fixtures reject mutations without changing the saved box.
- **SC-004**: At 320 pixels and with keyboard-only interaction, all Story 1 and
  Story 2 actions are reachable with no horizontal page scrolling; malicious
  fixture content produces zero executable markup or forbidden active links.
- **SC-005**: A record with 20 fields, including a 10,000-character multiline
  value, survives the full lifecycle without truncation. Any implementation
  limits above this supported baseline are documented and rejected before save,
  never applied by silently shortening data.

## Assumptions

- Recovery-first positioning was explicitly approved on 2026-10-07. Standard
  password-manager labels are conveniences, not a move toward daily autofill.
- Existing authenticator enrollment, unlock, box selection, and explicit
  push/pull remain the entry points; this feature adds no account or server.
- Users retain a compatible enrolled authenticator, its required verification
  material, the encrypted file, and the original domain identity. A new field
  editor cannot reconstruct lost keys, files, or origin identity.
- Zero-field titled records and empty named fields are allowed. Custom-field
  hiding defaults to on; the suggestions above provide visible conveniences.
- Schema, module interfaces, migration mechanics, and tests were modeled before
  implementation, following constitution 1.1.0. Implementation evidence is
  recorded in tasks.md; the model alone does not establish browser behavior.
- Untouched imported values retain their original line endings even after reveal
  or unrelated edits. Deliberately editing a value replaces it with the browser
  control's input; editing CR/CRLF content shows a warning about LF
  normalization. No other implicit value normalization is authorized.
