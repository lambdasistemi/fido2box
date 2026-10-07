# Recovery and backups

Keep the information you will need after losing a device together, then rehearse
recovering it from an encrypted file and a spare enrolled key.

1. Open the app at `https://fido2box.dev/` and create a box with a compatible
   security key. Keep a separate backup key and enroll it while the box is open.
2. Add the recovery items you need. Download the encrypted JSON file and keep a
   copy outside this browser. The key alone cannot recreate the box file.
3. Optionally connect a private GitHub repository through Settings and Sync. Use
   a fine-grained token limited to that repository with Contents read/write.
   Push is explicit; local changes are not automatically backed up.
4. Test recovery in another browser: import the backup, unlock with each
   enrolled key, and verify the required items are present.

Credentials belong to the original domain. A rehearsal at `http://localhost`
creates different credentials. Renew the production domain and preserve the box
files: rebuilding the app on the original domain is possible; recreating a lost
box is not.

Removing a key does not rotate the data key. Someone with an old copy and the
removed key can also decrypt future contents encrypted under that same data key.
For revocation, create a new box with retained keys and fresh encryption. This
does not erase information already exposed in old copies.

Pull clears the unlocked session and any discarded draft before replacing the
box. Unlock the fetched copy before editing it. Conflicting writes from another
tab are refused; unlock the current copy and try again. Keep downloaded backups
before synchronization. The broader findings in
[issue #16](https://github.com/lambdasistemi/fido2box/issues/16) remain open.

## Record the values you need

Choose **New record**, give it a title and add fields. Account, Password or
recovery key, Website, Backup codes and Notes are optional starting points. A
custom field starts hidden. Choose text, multiline or URL independently of its
hiding setting. Names may repeat; each control includes the field's position.
Empty values and title-only records are valid.

Each value has Copy, including hidden and empty values. Visible URL values link
only to HTTPS or loopback HTTP for rehearsal; invalid or blank addresses can be
saved and copied but do not navigate. Plain text never becomes a link by itself.
Reveal and Hide are temporary and independent for each field.

In Edit, existing hidden values stay absent from controls until you choose
Reveal or Replace. Replace starts an empty buffer. Secret entry offers Show/Hide
and optional **Confirm this value**. Confirmation begins empty, compares spaces
and line breaks exactly, and can be disabled. It is never exported or saved.
Remove field offers Undo until Save. Cancel leaves the saved record intact;
navigation asks before discarding changes, while Lock discards immediately.

Untouched imported CR/CRLF text remains exact, even after Reveal or a title
edit. Deliberately editing that value uses the browser's LF line endings; a
warning appears before the control. A failed save leaves the draft available and
the previous saved source unchanged.

## Open older or unfamiliar files

Legacy notes retain their complete text. Legacy title/address/secret records
become fields, preserving empty titles and values. Opening, copying, downloading
and synchronizing do not migrate the format. The first content, key or token
edit asks permission to write v3 and requires a verified encrypted backup first.
If backup storage fails, saving is refused.

**Older releases cannot safely edit v3 files.** The retained original recovers
only pre-migration data. Boxes and Sync list **Retained backups**, including
deleted box names, with encrypted downloads. Both databases live in the same
browser: download an external copy against browser-data loss.

Unknown envelope or record data makes the box read-only. Supported sibling
records remain viewable and copyable; the original encrypted file remains
downloadable and can be pushed without reconstruction. Push refuses to overwrite
an unfamiliar or malformed remote envelope. This is a format check, not an
authentication of remote revision metadata or unseen encrypted payloads.

## Recognizing a key and choosing its name

Choose **Identify my key** when creating a box or adding a key. The app checks
credentials in local boxes, including locked boxes, and GitHub boxes already
loaded in the current session. You do not need to unlock them. If the backup is
not available here yet, import its JSON file first. GitHub boxes that need an
unavailable token cannot be searched.

A recognized credential reuses its existing nickname. Creating or adding it
requires a fresh PIN/touch confirmation from that same key. If identification is
cancelled or finds no match, the app cannot conclude that the hardware is new:
retry or import the missing box.

For a key not registered in the available boxes, choose **Use an unregistered
key**. Its nickname is optional; the app supplies a name such as “Security key
1” when blank. Nicknames are public descriptions stored with the box, not
passwords and not labels written onto the hardware. Manual enrollment refuses
known hardware so it cannot silently acquire another nickname.

The optional hardware label on the Security keys page is separate. Reading one
suggests a nickname; it is not proof of identity and never renames existing box
entries. Older boxes may already use several credentials or nicknames for the
same hardware. The app preserves these records; it cannot infer physical key
identity from names alone.
