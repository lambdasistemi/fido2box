// Explanatory transitions only. No app imports, credentials, storage or network APIs.
(() => {
  const root = document.getElementById("state-explorer");
  if (!root) return;
  const places = {
    key: "Hardware key",
    boxes: "Browser · box files",
    backups: "Browser · retained backups",
    settings: "Browser · preferences",
    memory: "Open page · memory",
    github: "GitHub",
    downloads: "Downloaded files",
    clipboard: "Clipboard",
  };
  const migration =
    "For an older supported box, the first edit requires your approval and a verified encrypted backup. Backup failure prevents the edit; a backup can remain if a later step fails. A concurrent local change refuses the save and locks the session. Unknown data makes the box read-only.";
  const backupEffect = [
    "Existing retained originals, if any",
    "For an approved old-format migration: add and verify the exact original. Otherwise unchanged.",
  ];
  // Omitted locations are explicitly rendered as unchanged, never silently hidden.
  const actions = [
    {
      id: "disconnect",
      group: "GitHub access",
      title: "Disconnect / Forget session token",
      requires: "A GitHub connection or manually entered session token exists.",
      effects: {
        memory: [
          "Live token, connection reference, remote cache; possibly open boxes",
          "Clear token, access reference and remote cache. Abort pending network work. Open boxes and their plaintext remain; the selected repository remains.",
        ],
      },
      failure:
        "A completed key write or GitHub Push is not undone. Local box metadata can still list the key. This is not a browser-wide forget operation.",
    },
    {
      id: "setup",
      group: "GitHub access",
      title: "Save access on key (first setup)",
      requires:
        "A valid repository and token; a key/browser supporting the required PRF and largeBlob operations. Approve the key requests.",
      effects: {
        key: [
          "No selected GitHub access profile",
          "Create a discoverable credential. Store an encrypted repository/token profile and verify it by reading it back.",
        ],
        memory: [
          "Typed repository/token; any previous connection",
          "Clear old connection and cache at start. After verification, hold the token and credential reference; fetch encrypted remote boxes into the cache. No box is unlocked.",
        ],
      },
      failure:
        "Invalid GitHub access is refused before writing. A later failure or cancellation can leave a credential or written profile on the key even though the browser is disconnected. No saved box is required. Multiple PIN/touch prompts may occur.",
    },
    {
      id: "connect",
      group: "GitHub access",
      title: "Use security key / Try key again",
      requires:
        "The key already has a GitHub access profile for this website. Select that credential and approve its request.",
      effects: {
        memory: [
          "Disconnected, or an older connection",
          "Clear old access/cache. Read and decrypt the key profile, validate GitHub access, then hold token/repository/reference and fetch remote encrypted files into memory.",
        ],
      },
      failure:
        "An unanswered request cannot distinguish cancellation, timeout and no matching credential. Offer retry and optional explicit setup; never automatically create a profile. A readable profile with a refused token offers renewal. No files are imported and no boxes are unlocked.",
    },
    {
      id: "renew",
      group: "GitHub access",
      title: "Renew access on key",
      requires:
        "A selected profile reference from connection or a readable profile whose token GitHub refused; a valid replacement token.",
      effects: {
        key: [
          "Selected encrypted access profile",
          "Replace its encrypted repository/token profile and verify the new value. Reuse the credential.",
        ],
        memory: [
          "Selected profile; possibly old connection",
          "Clear old live access/cache. Publish the replacement token/repository only after verification; refresh the remote cache.",
        ],
      },
      failure:
        "A completed hardware write can survive a later failure, leaving the page disconnected. Updating the profile does not revoke the old token at GitHub. Without a selected reference, Set up creates a new credential.",
    },
    {
      id: "setup-form",
      group: "GitHub access",
      title: "Open / edit / cancel the setup form",
      requires: "No key operation is running.",
      effects: {
        memory: [
          "Current view and connection",
          "Opening/typing holds form input in the page. Cancel setup removes those inputs. The existing connection, if any, stays connected.",
        ],
      },
      failure:
        "No hardware write happens until Save access on key is submitted. Merely opening the Create a GitHub token link does not save a token in this app.",
    },
    {
      id: "cancel-access",
      group: "GitHub access",
      title: "Cancel an in-progress key access request",
      requires: "Setup, renewal, or connection is running.",
      effects: {
        key: [
          "Hardware state at cancellation",
          "Any credential creation or profile write already accepted remains. Unfinished requests are asked to abort.",
        ],
        memory: [
          "Pending request; previous connection was cleared at start",
          "Cancel request and refuse its late result. No new connection is published.",
        ],
      },
      failure:
        "Cancellation is not rollback of hardware storage. Connect again to check a profile that may have been written.",
    },
    {
      id: "manual-token",
      group: "GitHub access",
      title: "Use a token for this session",
      requires:
        "Enter a token in Settings; the current repository is selected.",
      effects: {
        memory: [
          "Typed token; old access/cache",
          "Disconnect key access, replace the live token, clear its input and fetch remote encrypted files. Keep the token only in page memory.",
        ],
      },
      failure:
        "If GitHub refuses it, the manually entered token remains in memory until forgotten or the page closes. No token is written to the key or browser preferences.",
    },
    {
      id: "refresh",
      group: "GitHub access",
      title: "Refresh GitHub / Test the connection",
      requires:
        "A live token and repository, or an available legacy token from an unlocked box.",
      effects: {
        memory: [
          "Old or absent remote cache",
          "Clear the cache, then fetch the encrypted remote box files. Update the list and public key metadata without importing or decrypting boxes.",
        ],
      },
      failure:
        "Failure leaves a remote error instead of the old cache. The live token and local files remain. A cancelled or superseded request cannot publish a late cache.",
    },
    {
      id: "create",
      group: "Box files and contents",
      title: "Create a box",
      requires: "An unused local name and an approved key enrollment.",
      effects: {
        key: [
          "Existing key credential material",
          "Using an unregistered key creates a credential. Choosing an identified credential reuses it; neither path saves a GitHub profile.",
        ],
        boxes: [
          "No local file with this name",
          "Store a new encrypted box at revision 1, with credential ID, nickname, and wrapped data key.",
        ],
        memory: [
          "Create form",
          "Generate a fresh data key and leave the new box unlocked. Clear the create form after success.",
        ],
      },
      failure:
        "A key credential may be created before a browser save fails. A conflicting name or failed enrollment prevents local creation. GitHub is unchanged until Push.",
    },
    {
      id: "import",
      group: "Box files and contents",
      title: "Import a box file",
      requires:
        "A valid downloaded box whose normalized name is not already in the local library.",
      effects: {
        boxes: [
          "No local box with this name",
          "Store the imported encrypted file exactly.",
        ],
        memory: [
          "Local library view",
          "Show the imported box as locked. Its public metadata adds known credentials for this website.",
        ],
      },
      failure:
        "Invalid input or a name conflict refuses the import. The downloaded original is not moved or deleted. Import needs no key and does not prove the inserted key can unlock it.",
    },
    {
      id: "pull",
      group: "Box files and contents",
      title: "Pull from GitHub",
      requires:
        "A connected token and listed remote box. Approve discarding a dirty draft; replacing a newer local revision needs a second press.",
      effects: {
        boxes: [
          "Absent or existing local encrypted file",
          "Store the fetched encrypted source exactly, replacing the previous active local copy.",
        ],
        memory: [
          "Possibly open box and draft",
          "Discard approved draft and lock the box before fetching. After success refresh the library/cache; the replacement stays locked.",
        ],
      },
      failure:
        "Failed fetch, cancellation, or stale local state prevents replacement, but the box has already been locked. A newer-local warning also leaves it locked. Pull does not automatically retain a backup of the overwritten file.",
    },
    {
      id: "unlock",
      group: "Box files and contents",
      title: "Unlock a box",
      requires:
        "A local box and one of its enrolled credentials on a usable key. Approve verification.",
      effects: {
        memory: [
          "Locked box; encrypted metadata only",
          "Hold the decrypted data key and records for this box. Fields marked hidden stay hidden in the view. A legacy box token may also supply GitHub access/cache unless an explicit access choice superseded it.",
        ],
      },
      failure:
        "Wrong key, cancellation, decryption failure or changed local source leaves it locked. Supported records in a box containing unknown data can be viewed, but the whole box is read-only. Unlock does not migrate the file.",
    },
    {
      id: "lock",
      group: "Box files and contents",
      title: "Lock a box",
      requires: "The selected box is open.",
      effects: {
        memory: [
          "Data key, plaintext records, draft and reveal state for this box",
          "Drop this box's session and editor state; invalidate pending box work. Other boxes and the explicit GitHub connection stay as they were.",
        ],
      },
      failure:
        "Unsaved edits are discarded immediately. A legacy token held only in this box stops being available through that session; an already-fetched remote cache is not itself cleared. Clipboard contents remain and its pending clear timer continues.",
    },
    {
      id: "edit",
      group: "Box files and contents",
      title: "New / edit record; change / add / remove / undo fields",
      requires:
        "An unlocked writable box. Open an editor before changing a field.",
      effects: {
        memory: [
          "Saved records in the open session",
          "Create or update an unsaved draft. Titles, names, values, types, hidden flags, removed-field undo and optional secret confirmations stay in memory.",
        ],
      },
      failure:
        "Editing is not saving. Lock, reload or approved navigation discards the draft. Cancelling a navigation warning keeps it. Confirmation values are never written into a box.",
    },
    {
      id: "save",
      group: "Box files and contents",
      title: "Save a record",
      requires:
        "A valid draft in an unlocked writable box; any enabled secret confirmation matches exactly.",
      effects: {
        boxes: [
          "Previously saved encrypted revision",
          "Replace with the newly encrypted record set and increment the revision.",
        ],
        backups: backupEffect,
        memory: [
          "Open session plus unsaved draft",
          "Update the open session to saved records; clear the draft and confirmations.",
        ],
      },
      failure:
        "Validation or storage failure preserves the saved file and normally the draft. A stale/concurrent operation is refused. " +
        migration,
    },
    {
      id: "cancel-edit",
      group: "Box files and contents",
      title: "Cancel the record editor",
      requires: "An editor is open.",
      effects: {
        memory: [
          "Draft and confirmation/reveal buffers",
          "Discard editor state and show the previously saved records. The box remains unlocked.",
        ],
      },
      failure:
        "No saved file changes. A discarded draft cannot be recovered from the saved box.",
    },
    {
      id: "delete-record",
      group: "Box files and contents",
      title: "Delete a record (confirm)",
      requires: "An unlocked writable box and confirmation of deletion.",
      effects: {
        boxes: [
          "Encrypted revision containing the record",
          "Save a new encrypted revision without that record.",
        ],
        backups: backupEffect,
        memory: [
          "Open session containing the record",
          "Update the session to the saved record set and clear the editor state.",
        ],
      },
      failure:
        "Refusing confirmation changes nothing. Save failure preserves the old file. " +
        migration +
        " GitHub history and downloaded copies can still contain the old record.",
    },
    {
      id: "reveal",
      group: "Box files and contents",
      title: "Show / Hide / Replace a hidden field",
      requires: "An unlocked box; replacement requires a writable editor.",
      effects: {
        memory: [
          "Decrypted values already in session; hidden display",
          "Show/Hide changes display state only. Replace opens an empty draft input; the old saved value persists until Save succeeds.",
        ],
      },
      failure:
        "Hiding a field does not lock the box or remove its decrypted value from the session. No disk, key or GitHub update occurs here.",
    },
    {
      id: "add-key",
      group: "Box credentials",
      title: "Add a security key to this box",
      requires:
        "An unlocked writable box and a different credential; identify an existing credential or enroll an unregistered key.",
      effects: {
        key: [
          "Existing credential material",
          "Reuse the identified credential, or create a new credential on the chosen key.",
        ],
        boxes: [
          "Box with its current enrolled credentials",
          "Add the new credential ID, nickname and wrapped copy of the same data key. Save a new encrypted revision.",
        ],
        backups: backupEffect,
        memory: [
          "Open session",
          "Update it to the new revision; the box stays open and the new credential becomes known here.",
        ],
      },
      failure:
        "An enrollment may succeed before a local save fails. " +
        migration +
        " Other box copies do not gain this key until updated. This does not copy the GitHub access profile to a spare key.",
    },
    {
      id: "remove-key",
      group: "Box credentials",
      title: "Remove a key from this box (confirm)",
      requires:
        "An unlocked writable box with at least two enrolled credentials.",
      effects: {
        boxes: [
          "Box lists the selected credential and its wrapped data key",
          "Remove that entry and save a new encrypted revision; keep the same data key.",
        ],
        backups: backupEffect,
        memory: [
          "Open session and known-key list",
          "Update the session and list. The credential may still be known through other boxes, remote cache, or a live access connection.",
        ],
      },
      failure:
        migration +
        " The physical credential is not deleted. Old copies remain usable with it; removing a wrapper is not full revocation or browser-wide forgetting.",
    },
    {
      id: "remove-legacy",
      group: "GitHub access",
      title: "Remove a legacy token from a box (confirm)",
      requires:
        "An unlocked writable box containing legacy GitHub token records.",
      effects: {
        boxes: [
          "Encrypted box containing legacy token record(s)",
          "Save new encrypted revision(s) without those legacy token records.",
        ],
        backups: backupEffect,
        memory: [
          "Session may supply a legacy token; remote cache",
          "Remove the token records from this session, clear remote cache and abort network work. A separately connected key/manual token stays available.",
        ],
      },
      failure:
        migration +
        " Multiple legacy tokens are removed in separate saves; a later failure can leave some removed and some retained. GitHub token validity is unchanged. Old box copies can still contain the token.",
    },
    {
      id: "push",
      group: "Copies and synchronization",
      title: "Push to GitHub",
      requires:
        "A saved local box and a token with access to the selected repository.",
      effects: {
        github: [
          "Absent, identical, or older remote box",
          "Write the exact saved local encrypted file to boxes/NAME.json as a repository commit, unless already identical. Prior history remains.",
        ],
        memory: [
          "Remote cache before Push",
          "Refresh the cache after success. Box sessions and unsaved drafts are not saved by Push.",
        ],
      },
      failure:
        "Newer, unsupported or concurrently changed remote files are refused. A completed GitHub write may remain after a lost response or cancellation; Refresh to check. This sends the saved file, not an unsaved editor draft.",
    },
    {
      id: "download",
      group: "Copies and synchronization",
      title: "Download the box / a retained backup",
      requires:
        "A local box or retained backup and a completed browser download.",
      effects: {
        downloads: [
          "Existing independent files",
          "Add the exact encrypted source as a downloaded file. A retained-backup download contains the original pre-migration source.",
        ],
      },
      failure:
        "Cancelling the download leaves the app's files untouched. The downloaded copy includes public key metadata and does not track future changes automatically.",
    },
    {
      id: "delete-local",
      group: "Copies and synchronization",
      title: "Delete from this browser (confirm)",
      requires: "An active local box and confirmation.",
      effects: {
        boxes: [
          "Selected local encrypted box",
          "Delete its active local file.",
        ],
        memory: [
          "Selected box's session, draft and library entry",
          "Lock that box, clear editor state, remove the local entry. The remote cache may still list the same box and credentials.",
        ],
      },
      failure:
        "A stale or failed delete leaves the file but the session has already been locked. Retained migration backups are not deleted. Other boxes and GitHub access stay as they were.",
    },
    {
      id: "identify",
      group: "Identify and label a key",
      title: "Identify / Detect the inserted key",
      requires:
        "Available box metadata or a current access reference supplies credential IDs to check.",
      effects: {
        memory: [
          "No selected/detected credential, or an earlier result",
          "Remember the credential that answered and show its existing nickname. The enrollment picker can reuse that credential.",
        ],
      },
      failure:
        "Cancellation or no matching response does not prove the key is empty. No box is unlocked or renamed; no GitHub profile is written. Internal authenticator counters are outside this app-data map.",
    },
    {
      id: "probe",
      group: "Identify and label a key",
      title: "Test the key",
      requires: "Approve creation of a test credential.",
      effects: {
        key: [
          "Existing authenticator state",
          "Process a throwaway credential creation with resident storage discouraged. The app does not retain its handle or intentionally create a resident label/profile.",
        ],
        memory: [
          "Old or absent test result",
          "Show whether the key answered and what capability information was returned.",
        ],
      },
      failure:
        "A failed/cancelled test does not identify the key or prove it empty. The test does not establish support for every GitHub profile storage operation; authenticator storage behavior can vary.",
    },
    {
      id: "write-label",
      group: "Identify and label a key",
      title: "Write a label on the key",
      requires:
        "A nonempty label of at most 64 encoded bytes; resident credential support and space.",
      effects: {
        key: [
          "Existing credentials and labels",
          "Create a resident label credential for this site. A different label is a separate entry; repeating the same user handle replaces that site's matching credential.",
        ],
        memory: [
          "Typed label",
          "Show completion. Existing box nicknames and the GitHub access profile stay as they were.",
        ],
      },
      failure:
        "A refused or failed creation is not reported as success. This does not rename credentials in box files and does not store a GitHub token.",
    },
    {
      id: "read-label",
      group: "Identify and label a key",
      title: "Read a label / Who is this?",
      requires:
        "Select a discoverable credential from this site and approve the request.",
      effects: {
        memory: [
          "No label result, or typed nickname",
          "Show the read label, or suggest it in the nickname input. A GitHub access credential is excluded from label results.",
        ],
      },
      failure:
        "No label or cancellation is not proof of an empty key. Reading a label does not prove which box credential is inserted. The suggested nickname reaches a box only after enrollment is saved.",
    },
    {
      id: "copy",
      group: "Clipboard",
      title: "Copy a field",
      requires: "An unlocked record and clipboard write permission.",
      effects: {
        memory: [
          "Previous clear timer, if any",
          "Keep only a digest of the copied value and start a one-minute clear timer; replace the previous successful copy's timer.",
        ],
        clipboard: [
          "Previous clipboard text",
          "Replace with this field's exact plaintext, including a hidden or empty value. The OS may also record history.",
        ],
      },
      failure:
        "A refused write leaves the previous clear timer in place. Copy does not save edits or lock the box.",
    },
    {
      id: "clipboard-timeout",
      group: "Clipboard",
      title: "One minute passes after Copy",
      requires:
        "The page is still alive with its clear timer; clipboard permissions allow reading and writing.",
      effects: {
        memory: [
          "Pending digest and clear timer",
          "Complete the clear attempt and report its result.",
        ],
        clipboard: [
          "Copied text, or something copied more recently",
          "Clear only if the current text still matches the saved digest. Otherwise leave it alone. Clipboard history is not erased.",
        ],
      },
      failure:
        "Read/write permission failure can leave plaintext on the clipboard. Closing the page cancels the timer. Locking a box does not cancel it.",
    },
    {
      id: "save-repo",
      group: "Preferences and navigation",
      title: "Save repository in Settings",
      requires: "A valid owner/repository name.",
      effects: {
        settings: [
          "Previously saved repository, or none",
          "Remember the new repository in localStorage.",
        ],
        memory: [
          "Current repository and remote cache",
          "Change the selected repository; clear remote cache and abort old network work. Cancel a busy access operation. An existing live token is not automatically revoked or cleared.",
        ],
      },
      failure:
        "Invalid names are refused. If browser storage is unavailable, the in-page choice can still change without being remembered. This does not rewrite the repository stored on the key; Connect can select that one again.",
    },
    {
      id: "preferences",
      group: "Preferences and navigation",
      title: "Change theme / inline-help preference",
      requires: "Use the app's theme or inline-help control.",
      effects: {
        settings: [
          "Previous appearance/help preference",
          "Remember the chosen theme or inline-help setting in localStorage, when available.",
        ],
        memory: [
          "Current appearance/help display",
          "Apply the choice to the view.",
        ],
      },
      failure:
        "Blocked browser storage can prevent remembering the preference. No credential, token or box changes.",
    },
    {
      id: "navigate",
      group: "Preferences and navigation",
      title: "Change app view / tab; open or close help",
      requires: "Approve discarding a dirty draft when leaving its editor.",
      effects: {
        memory: [
          "Current view, possibly editor draft/reveals or help dialog",
          "Change the view or dialog. Leaving an editor clears its draft/reveal state, but box sessions stay open. Changing the app route cancels a busy key-access request.",
        ],
      },
      failure:
        "Refusing the dirty-draft warning keeps the current view and draft. Opening/closing help alone does not discard a draft. A key write accepted before route cancellation can remain.",
    },
    {
      id: "unplug",
      group: "Leaving and forgetting",
      title: "Unplug the hardware key",
      requires: "The key is physically removed.",
      effects: {
        key: [
          "Key connected to this machine",
          "Key physically absent; its saved credential/profile/label data is retained.",
        ],
      },
      failure:
        "The app does not lock or disconnect merely because the key is unplugged. Open plaintext and live tokens remain usable in memory. A pending key request may fail or time out.",
    },
    {
      id: "reload",
      group: "Leaving and forgetting",
      title: "Reload / close / leave the app page",
      requires: "The app page ends; reload starts a fresh page.",
      effects: {
        memory: [
          "Live access, box sessions, drafts, caches, clipboard timer",
          "Disconnect, drop box sessions and drafts, dispose the clipboard timer. On reload, read local encrypted files/preferences again; boxes start locked and explicit GitHub access is disconnected.",
        ],
      },
      failure:
        "Saved local files, key profiles and remote files persist. Already-copied clipboard text may survive because the page can no longer run its clear timer. Close/reload every app tab to end their separate sessions.",
    },
    {
      id: "clear-site",
      group: "Leaving and forgetting",
      title: "Clear this site's data + reload all app tabs (browser settings)",
      requires:
        "Use browser settings to remove this site's complete stored data, including both databases and localStorage, then reload/close all its app tabs.",
      effects: {
        boxes: [
          "All local encrypted box files",
          "No app box files remain in this browser's storage for this site.",
        ],
        backups: [
          "All retained encrypted migration originals",
          "No retained backups remain here.",
        ],
        settings: [
          "Saved repository, theme and help preference",
          "Remove saved preferences; use defaults on next load.",
        ],
        memory: [
          "Sessions in open app tabs",
          "Closing/reloading every app tab discards its sessions, drafts and caches. The new browser view knows no credentials until access or box data is loaded again.",
        ],
      },
      failure:
        "This is not an implemented app button. Clearing only cookies is insufficient. Unsynced local files/backups are lost. The hardware key, GitHub, downloads and clipboard survive; Connect or Import can make credentials known again.",
    },
    {
      id: "revoke-token",
      group: "Leaving and forgetting",
      title: "Revoke / expire the token at GitHub (outside the app)",
      requires: "GitHub revokes the token, or its expiry is reached.",
      effects: {
        github: [
          "Token authorizes requests to the repository",
          "Token no longer authorizes requests. Repository box files and history remain.",
        ],
      },
      failure:
        "The encrypted profile on the key and any live token string remain until separately replaced/cleared. The page learns of refusal on its next request; already-unlocked local boxes stay usable. Renew access must use a valid replacement token.",
    },
  ];
  const select = root.querySelector("select");
  const result = root.querySelector("#state-result");
  if (!select || !result) return;
  function element(tag, text, className = "") {
    const node = document.createElement(tag);
    node.textContent = text;
    node.className = className;
    return node;
  }
  const groups = new Map();
  for (const action of actions) {
    if (!groups.has(action.group)) {
      const group = document.createElement("optgroup");
      group.label = action.group;
      groups.set(action.group, group);
      select.append(group);
    }
    const option = document.createElement("option");
    option.value = action.id;
    option.textContent = action.title;
    groups.get(action.group).append(option);
  }
  function render() {
    const action = actions.find((a) => a.id === select.value);
    if (!action) return;
    const grid = element("div", "", "state-grid");
    grid.setAttribute("role", "list");
    for (const [id, label] of Object.entries(places)) {
      const effect = action.effects[id];
      const card = element(
        "div",
        "",
        "state-place" + (effect ? " changed" : ""),
      );
      card.setAttribute("role", "listitem");
      card.dataset.place = id;
      card.append(element("p", label, "state-label"));
      if (effect) {
        card.append(element("p", "Before: " + effect[0]));
        const arrow = element("p", "↓", "state-arrow");
        arrow.setAttribute("aria-hidden", "true");
        card.append(arrow, element("p", "After: " + effect[1]));
      } else {
        card.append(
          element(
            "p",
            "Unchanged — whatever was here remains here.",
            "state-unchanged",
          ),
        );
      }
      grid.append(card);
    }
    result.replaceChildren(
      element("p", action.title, "state-action-name"),
      element("p", "Starting condition: " + action.requires),
      grid,
      element("p", "Limits / failure: " + action.failure, "state-caveat"),
    );
  }
  select.addEventListener("change", render);
  render();
})();
