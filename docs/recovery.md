# Recovery and backups

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

Until [issue #16](https://github.com/lambdasistemi/fido2box/issues/16) is
resolved, lock a box before Pull and unlock it again afterward. Keep downloaded
backups before synchronization; the current Pull flow can retain stale unlocked
state.

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
