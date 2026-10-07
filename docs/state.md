# What changes when I act?

You want to know what your key remembers, what this browser remembers, and what
survives after you leave. This page maps the current preview's actions to those
places. Start with **Disconnect**, **Lock**, and **Clear site data** in the
explorer: they have very different effects.

**A box is a file, not a storage location.** Copies of that file can be in this
browser, on GitHub, or in your Downloads folder. Its records are encrypted. Its
key nicknames, credential identifiers, and revision are public metadata. It also
contains an encrypted copy of its data key for each enrolled credential.

## Follow one action

Choose an action to see its before-and-after state in **every location**. This
is an explanation: selecting an action here does not operate your key, connect
to GitHub, read your boxes, or clear anything. Actions with the same storage
effects are grouped. The result assumes success; the failure note explains
exceptions.

<div id="state-explorer">
  <label for="state-action"><strong>User action</strong></label>
  <select id="state-action" aria-controls="state-result"></select>
  <div id="state-result" aria-live="polite" aria-atomic="true"></div>
  <noscript>Enable JavaScript for the action explorer. The diagrams and explanations below remain available.</noscript>
</div>

## Where the state lives

| Place                     | What it contains                                                                                                                 | Survives closing the page?                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Hardware key              | Credential secrets; optional key label; after GitHub setup, a discoverable credential with an encrypted repository/token profile | Yes                                          |
| Browser: box files        | Encrypted local box copies, including enrolled credential IDs and nicknames                                                      | Yes                                          |
| Browser: retained backups | Exact encrypted originals kept before an approved format migration                                                               | Yes, even after deleting the active box      |
| Browser: preferences      | Manually saved repository, theme, inline-help preference                                                                         | Yes                                          |
| Open page memory          | Connected token; remote-file cache; unlocked box data keys and plaintext; unsaved drafts; display state                          | No active session survives closing/reloading |
| GitHub                    | Encrypted box files and repository history; GitHub also manages token validity                                                   | Yes                                          |
| Downloaded files          | Independent encrypted box or backup copies                                                                                       | Yes                                          |
| Clipboard                 | A copied field, in plaintext; the OS may retain history                                                                          | May survive; clearing is best effort         |

The box's **data key** encrypts its records; it is not your physical security
key. The app stores local files and retained backups in two separate browser
databases. Saving a record changes the local box. **Only Push updates GitHub.**
A download never updates itself when you edit the box later.

GitHub setup stores the token on the key, encrypted with a secret derived
through that credential. Connecting reads it into page memory so requests can
use it. It is not saved to browser preferences. Older boxes may still contain an
encrypted legacy GitHub token; unlocking one can supply access until you
explicitly choose another access method. New key setup does not remove that old
record.

## GitHub connection state

This machine shows the common connection path in the open page. The explorer
also covers renewal, manual tokens, and all the other action groups. Each edge
can have effects elsewhere: use the explorer for the complete transition. In
particular, successful **Save access on key** writes hardware storage;
**Connect** reads it. Neither action imports or unlocks a box.

<!-- diagram: state-github -->

Starting an access request clears the previous live token and remote cache.
Verification must finish before the new connection is published. Cancel or
failure leaves the page disconnected, but a hardware write already accepted can
remain. Disconnect clears access and the remote cache; it leaves
already-unlocked boxes open.

## One box in this browser

This diagram shows importing and opening one box. The explorer also covers
Create, edits, Save, and deletion. Other boxes and the GitHub connection have
their own state at the same time. Import and Pull give the browser an encrypted
file. Unlock adds its data key and decrypted records to page memory.

<!-- diagram: state-box -->

Create produces a new local file and leaves it open. Edit changes a memory-only
draft; Save encrypts the new records into the local file and keeps the box open.
Lock discards its plaintext and draft. Pull locks it before fetching a
replacement, even when that fetch fails. Delete from this browser removes its
active local file and locks it; retained migration backups stay. These actions
do not automatically change GitHub or downloaded copies.

## What forgetting this browser means

There is currently **no “Forget this key” button**. The displayed known-key list
is computed from local boxes, fetched remote boxes, and the current key
connection. There is no separate permanent key address book to erase.

<!-- diagram: state-forget -->

Clearing this site's data in browser settings, then reloading or closing **all
app tabs for this site**, removes the app's local box files, retained backups,
preferences, and live sessions. It also loses any local changes you have not
exported or pushed. This is a browser operation, not a button on this page.

The key, GitHub, existing downloads, and clipboard are outside that erasure.
Connecting with the configured key can recover the GitHub access profile again.
Pulling or importing a box makes its listed credentials known again, even while
the box is locked. A retained backup can also bring old metadata back if
imported.

Removing one credential from one box is different: it edits that box's local
file. It does not erase the credential from the physical key, change other
copies, or rotate the box's data key. It is not full revocation. See
[recovery and backups](recovery.md) before discarding your only copy.

## Limits and code behind the map

These diagrams describe application data, not every browser or hardware byte.
Authenticator counters and PIN retry state, browser history/caches,
operating-system snapshots, extensions, and copies made by other software are
outside the map. Clearing a JavaScript reference is not a claim of forensic
memory erasure. Unplugging the key is not a Lock action: an already-open box and
a connected token stay in page memory until an action clears them.

No transaction spans the hardware key, browser database, and GitHub. A key
creation can succeed before a local save fails. A backup can be retained before
a later edit fails. A GitHub write can succeed before its response is lost.
Cancellation cannot undo writes that have already completed. The explorer calls
these cases out.

This map describes the key-held GitHub access preview in
[PR #35](https://github.com/lambdasistemi/fido2box/pull/35). It is an
explanation checked against the implementation, not a formal proof or
physical-device compatibility claim. The source owners are `web/app.js` (actions
and known-key list), `web/key-access.js` and `web/github-access-session.js` (key
profile and connection), `web/box-session.js` and `web/store.js` (box files and
backups), `web/record-session.js` (drafts), `web/clipboard.js`, and
`web/webauthn.js`. Preview and production are separate website addresses with
separate browser storage and key credential scopes.
