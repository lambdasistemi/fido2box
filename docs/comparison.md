# Comparison with similar systems

fido2box is designed for getting back into other accounts after losing your
devices: keep a few recovery secrets in an encrypted file, then open it through
a static site with an enrolled authenticator. Its distinguishing choice is this
combination of recovery workflow, file ownership, and browser-based PRF
unlocking. The [README][fido-readme] describes that intended use; the
[security boundaries](security.md) qualify what the current implementation
guarantees.

Research checked **2026-10-07**, using the official sources linked below. This
compares documented workflows, not security strength or every product feature.
Bitwarden and 1Password rows describe ordinary personal accounts; Passpack
describes its team service. Organization policies and alternative sign-in
configurations can change dependencies. Passpack sources were available through
indexed official pages; direct retrieval failed during this review.

## Workflow and storage

Here, an account means an account with the vault or storage service, not the
website credentials stored inside a record. Every system can hold recovery
information; the daily-use column describes its documented workflow.

| System    | Daily use or recovery use                                                                                | Vault/service accounts                                                                                     | Storage and deployment                                                                                                        |
| --------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| fido2box  | Recovery-first: named fields, optional addresses, per-value copy. [README][fido-readme]                  | No fido2box account; optional GitHub backup requires repository access. [README][fido-readme]              | Static site, no backend; encrypted browser storage, JSON downloads, optional explicit GitHub Push/Pull. [README][fido-readme] |
| Bitwarden | Daily password management with browser saving and autofill. [Browser guide][bw-browser]                  | Account on a selected cloud region or self-hosted server. [Server regions][bw-server]                      | Hosted service or a deployed Bitwarden server. [Hosting][bw-hosting]                                                          |
| 1Password | Daily password management with browser saving and filling. [Browser guide][op-browser]                   | A 1Password account provides access across devices. [Sync guide][op-sync]                                  | Service-synchronized vaults, with local access after synchronization. [Sync guide][op-sync]                                   |
| KeePassXC | Desktop password management using an encrypted database. [Overview][kpx-home]                            | Local files need no vault-service account; optional cloud storage adds access requirements. [FAQ][kpx-faq] | Local KDBX file; optional synchronization through a chosen file-sync service. [FAQ][kpx-faq]                                  |
| KeeWeb    | Browser and desktop password management, with search and password generation. [Features][kw-home]        | Local files need no KeeWeb account; optional cloud storage adds access requirements. [FAQ][kw-faq]         | KDBX files; static web hosting or desktop app, optional cloud sync. [FAQ][kw-faq], [features][kw-home]                        |
| Passpack  | Team password management with shared records, custom fields, and browser access. [Glossary][pp-glossary] | Passpack user accounts within an organization; configured SSO is available. [Glossary][pp-glossary]        | Hosted service: device-side encryption before server storage; extension keeps encrypted local copies. [Privacy][pp-privacy]   |

## Keys and recovery

| System    | Hardware-key role                                                                                                           | What recovery depends on                                                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| fido2box  | WebAuthn PRF unwraps the data key; user verification required, hardware-only enrollment unenforced. [Security](security.md) | Box file, enrolled authenticator and verification, compatible browser, original domain/RP identity. [Recovery](recovery.md), [security](security.md)         |
| Bitwarden | FIDO2/passkey account 2FA; separately, encryption-enabled PRF passkeys can decrypt the vault. [2FA][bw-2fa], [PRF][bw-prf]  | Account/server access and an unlock method, or a prepared recovery route. [Recovery options][bw-recovery]                                                    |
| 1Password | The documented security-key setup provides account two-factor authentication. [Security keys][op-key]                       | Password-based sign-in needs account details, Secret Key, password, and enabled 2FA; recovery codes offer another route. [Kit][op-kit], [codes][op-recovery] |
| KeePassXC | Optional YubiKey/OnlyKey HMAC-SHA1 challenge-response contributes to database encryption. [FAQ][kpx-faq]                    | Database backup and its configured password, key file, and hardware-key components. [User guide][kpx-guide]                                                  |
| KeeWeb    | Documented YubiKey challenge-response protects the database master key in desktop apps only. [YubiKey guide][kw-key]        | KDBX file, password/key file, and any configured hardware-key protection. [FAQ][kw-faq], [YubiKey guide][kw-key]                                             |
| Passpack  | YubiKey account MFA documented; FIDO2/PRF vault decryption unverified in reviewed sources. [Security][pp-security]          | Service/account access, configured unlock method (Packing Key/device registration), and required MFA. [Security][pp-security], [Packing Key][pp-packing]     |

Recovery details depend on how each system was configured:

- **Bitwarden:** a two-step recovery code still requires the master password.
  Prepared emergency access or organization recovery may provide other routes.
  [2FA recovery][bw-code], [recovery options][bw-recovery]
- **1Password:** a prepared recovery code requires email access and leaves
  enabled 2FA in place. [Recovery codes][op-recovery]
- **KeePassXC:** a duplicate challenge-response key needs the same programmed
  HMAC secret. [User guide][kpx-guide]
- **KeeWeb:** the application cannot reset forgotten database passwords or
  recover lost key files. [FAQ][kw-faq]
- **Passpack:** preserve the administrator's Packing Key in a Data Recovery Kit;
  Passpack cannot reset it. An administrator can reset a team member's Packing
  Key. MFA emergency codes address lost second-factor access separately.
  [Packing Key][pp-packing], [team-member reset][pp-reset], [MFA
  recovery][pp-mfa]

## What the distinction means

Authenticator-assisted encryption is not unique to fido2box. Bitwarden documents
[PRF-based vault decryption][bw-prf], while KeePassXC documents
[challenge-response in the database key][kpx-faq]. A security key used for
account 2FA authenticates a login; that fact alone does not mean its output
encrypts the vault. 1Password's [security-key guide][op-key] describes that
second-factor role. KeeWeb is a close architectural comparison because its [web
app can also run on a static server][kw-faq].

For fido2box, owning the file removes the need for a vault-service account, but
does not remove operational dependencies. Preserve the box outside the browser,
enroll a spare key in advance, retain the production domain, and rehearse the
full recovery path. A copy accessible only through the account you are trying to
recover creates a circular dependency. GitHub synchronization is optional; a
downloaded box can be imported without it. See
[recovery and backups](recovery.md).

The static site and browser remain trusted while unlocking: the browser receives
plaintext and data-key material, and compromised served code could misuse that
access. Enrollment currently permits platform authenticators, so “hardware key
plus PIN” describes the intended workflow rather than an enforced hardware-only
guarantee. The remaining findings in [issue #16][fido-issue] include ineffective
key revocation and unauthenticated vault structure and revision. The record
implementation separately addresses stale unlocked state after Pull. See
[security boundaries](security.md) and the [audit notes][fido-audit]; this
comparison does not establish cryptographic assurance.

## Recovery records

Records contain a title and ordered named fields, with independent text,
multiline or URL kinds and hiding choices. URLs are optional; each value has
Copy, and permitted URLs are links. Optional secret confirmation is transient.
Legacy migration retains a verified encrypted original; older releases cannot
safely edit the new format. See the [README][fido-readme] and
[recovery guide](recovery.md). These conventions do not establish
interoperability or support for another product's vault format.

[fido-readme]: https://github.com/lambdasistemi/fido2box/blob/main/README.md
[fido-audit]: https://github.com/lambdasistemi/fido2box/blob/main/AUDIT.md
[fido-issue]: https://github.com/lambdasistemi/fido2box/issues/16
[bw-browser]: https://bitwarden.com/help/getting-started-browserext/
[bw-server]: https://bitwarden.com/help/server-geographies/
[bw-hosting]: https://bitwarden.com/help/self-host-an-organization/
[bw-2fa]: https://bitwarden.com/help/setup-two-step-login-fido/
[bw-prf]: https://bitwarden.com/help/login-with-passkeys/
[bw-recovery]: https://bitwarden.com/help/forgot-master-password/
[bw-code]: https://bitwarden.com/help/two-step-recovery-code/
[op-browser]: https://support.1password.com/getting-started-browser/
[op-sync]: https://support.1password.com/sync/
[op-key]: https://support.1password.com/security-key/
[op-kit]: https://support.1password.com/emergency-kit/
[op-recovery]: https://support.1password.com/recovery-codes/
[kpx-home]: https://keepassxc.org/
[kpx-faq]: https://keepassxc.org/docs/
[kpx-guide]: https://keepassxc.org/docs/KeePassXC_UserGuide
[kw-home]: https://keeweb.info/
[kw-faq]: https://github.com/keeweb/keeweb/wiki/FAQ
[kw-key]: https://github.com/keeweb/keeweb/wiki/YubiKey
[pp-glossary]: https://docs.passpack.com/admin-guide/passpack_glossary
[pp-privacy]: https://passpack.com/privacy/
[pp-security]: https://passpack.com/security/
[pp-packing]:
  https://docs.passpack.com/admin-guide/general-admin/mng-packing-key/create-packing-key
[pp-reset]:
  https://docs.passpack.com/admin-guide/general-admin/mng-packing-key/reset-user-packing-key
[pp-mfa]: https://docs.passpack.com/FAQ/lost-access-to-mfa
