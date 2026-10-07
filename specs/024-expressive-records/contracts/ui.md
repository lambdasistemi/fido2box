# Field and lifecycle interaction contract

No backend API is added. This document specifies browser-visible behavior; the
function model defines internal callbacks.

## Records panel

Show record titles in stored order, with one active detail/editor at a time.
Title-only records are valid. Untitled legacy records have a display-only
Untitled label. New record starts with an empty field collection and optional
suggestion buttons; Add field creates a hidden text field ready to name.
Suggestions remain ordinary removable fields. Internal tokens never appear here.

Each field is a labelled group with its name and ordinal. DOM/control identity
comes from opaque IDs, not user labels. Copy is available for every value,
including an empty value. Use names such as Copy Backup codes, field 3. Title is
record metadata, not a field requiring its own copy button.

| State                  | Value presentation and permitted actions                               |
| ---------------------- | ---------------------------------------------------------------------- |
| Visible text/multiline | Literal wrapped text, Copy, Edit                                       |
| Visible permitted URL  | Original text as anchor; normalized safeUrl href; Copy separate        |
| Visible invalid URL    | Literal text, non-secret invalid-address notice, Copy; no anchor       |
| Hidden field           | Fixed mask, Copy, Reveal; no value-bearing DOM/tooltip/accessible name |
| Revealed hidden URL    | Link only if policy permits; Hide restores mask and removes href       |
| Hidden field in editor | Mask, Reveal, Replace; no secret-bearing form value                    |
| Explicit Replace       | Empty edit buffer; saved original unchanged until successful Save      |

Use a textarea for actual value editing regardless of kind to avoid truncating
multiline imported values. Names/title may use text controls. A kind change
alone never changes a value. Render-only transformations must not feed back into
drafts. Reveal is not the same operation as changing the persisted hidden
toggle.

New or replacement secret entry starts masked with Show/Hide. Optional double
entry starts off; enabling it opens an empty masked confirmation with its own
Show/Hide. Compare exact strings after either input changes. An enabled mismatch
blocks Save with an associated non-secret message; disabling confirmation allows
normal validation. Clear confirmation and reveal state on Save, Cancel, removal,
departure, or lock. Never serialize confirmation. For multiline secret entry,
mask the editor visually without changing its value; test input, selection,
paste, reveal, and keyboard access rather than relying on a single-line input.

All anchors use a separate browsing context with noopener/noreferrer. Preserve
the existing parser-based HTTPS / loopback HTTP URL policy, including normalized
loopback aliases; do not invent a second URL recognizer in the editor. No
automatic navigation or linking of text-kind fields, previews, remote images, or
Open button.

## Editing and focus

Save validates the immutable candidate. Associate non-secret errors with their
controls and focus the first invalid field. Field removal affects the draft and
provides Undo before Save; restore its original position and ID. Duplicate
labels remain independent. Failed persistence keeps the draft and saved record
separate. Successful Save, Cancel, or departure clears temporary reveal/undo
state.

Tab/record/hash navigation prompts before discarding a dirty draft; rejecting
the prompt restores the prior active route without losing state. Inline help
does not count as departure. Incidental renders/async status updates retain
drafts. Lock discards immediately, aborts cancellable pending work, and resets
reveal state. Pull confirms draft discard before replacement starts, then
invalidates the session. Browser close/reload uses its native best-effort
unsaved-changes prompt; the page cannot guarantee that a browser presents it.

New controls preserve password-manager ignore attributes on inputs and
textareas. Actions wrap at 320 CSS pixels; values wrap without forcing
horizontal page scrolling. Test keyboard operation, visible focus, error
association, both themes, and hidden content absence in attributes as well as
text.

## Clipboard

Success is announced only after writeText resolves. Copy does not navigate,
unmask, or alter the field. Pass exact stored text to the browser clipboard API;
OS clipboard newline conventions are not under the application's control.

One controller tracks the last successful copy. After 60 seconds it attempts
read/compare/clear, preserving different current content. Failed subsequent copy
does not cancel the older successful copy's timer. Denied read/write announces
failure without a value. Serialize all controller clipboard operations,
including pending clear writes, so an older clear cannot complete after a newer
in-app copy. Generation fences supplement ordering; external clipboard writers
remain outside that protection. Retain only an ephemeral comparison fingerprint
for the scheduled attempt, not the copied string. Lock and navigation do not
cancel the attempt; release record/draft state separately. Dispose the
controller only on page teardown.

Clipboard history, external apps, browser shutdown, and denied permissions mean
clearing is never promised. No secret-bearing strings appear in status or
errors.
