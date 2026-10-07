# Identify a key before naming it

People should not need to remember whether they named a security key before, or
unlock every box to find out. Key nicknames describe a key to the person; they
are not passwords, do not unlock anything, and are visible in box metadata.

## Acceptance

- Creating a box or adding a key offers identification first when credentials
  are known. Locked local boxes participate without unlocking. Loaded GitHub box
  metadata participates too; inaccessible backups cannot be searched.
- A recognized key uses its existing nickname and credential, confirmed again
  with PIN/touch when enrolling. The user cannot accidentally rename it here.
- A cancelled, timed-out, or unmatched request says identification was
  inconclusive, preserves entered text, and never asserts that the hardware is
  new.
- Manual enrollment is explicit. Explain why a nickname helps and that it is
  optional: choose a unique default when omitted. Never treat a typed nickname
  or a label read from a key as proof of identity.
- Manual enrollment rejects a hardware key whose credential is already known,
  directing the person back to identification instead of creating another name.
- Enrollment cannot duplicate a credential already in the destination box.
  Switching hardware after identification cannot attach the wrong key under a
  known name.
- The Security keys page explains recognition without unlocking and
  distinguishes box nicknames from optional labels stored on the hardware.
- Existing boxes and credentials remain compatible; no migration or relabeling.
