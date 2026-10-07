# fido2box

## Recovery story

When you lose your everyday device, use a saved box and an enrolled key to
recover the secrets you need. Start with recovery instructions; maintainers can
follow the design pages to understand the trust and compatibility boundaries.

<!-- diagram: recovery-story -->

[Open the recovery app](https://fido2box.dev/).

fido2box keeps a small collection of recovery secrets in encrypted box files.
Each item contains a title, an address to open, and a secret to copy. The
browser uses WebAuthn PRF to unwrap a random data key and AES-GCM to decrypt the
items. The app has no runtime dependencies or application server.

This is experimental recovery software. Read the
[security boundaries](security.md) and rehearse
[recovery and backups](recovery.md) before relying on it.

The [comparison with similar systems](comparison.md) explains how its recovery
workflow, storage, and authenticator dependencies differ from password managers.

The [system design](architecture/system.md) maps the current components, data,
and trust boundaries. The [design work plan](architecture/roadmap.md) separates
open decisions and proposed changes from implemented behavior.

The repository is licensed under
[Apache-2.0](https://github.com/lambdasistemi/fido2box/blob/main/LICENSE).
