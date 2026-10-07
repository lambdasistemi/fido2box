# fido2box

[Open the recovery app](https://fido2box.dev/).

fido2box keeps a small collection of recovery secrets in encrypted box files.
Each item contains a title, an address to open, and a secret to copy. The
browser uses WebAuthn PRF to unwrap a random data key and AES-GCM to decrypt the
items. The app has no runtime dependencies or application server.

This is experimental recovery software. Read the
[security boundaries](security.md) and rehearse
[recovery and backups](recovery.md) before relying on it.

The repository is licensed under
[Apache-2.0](https://github.com/lambdasistemi/fido2box/blob/main/LICENSE).
