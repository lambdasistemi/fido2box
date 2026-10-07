# Security policy

This is experimental recovery software. Known limitations and the open review
are recorded in [issue #16](https://github.com/lambdasistemi/fido2box/issues/16)
and `AUDIT.md`. Do not interpret green CI as cryptographic certification.

Report new vulnerabilities through
[GitHub private vulnerability reporting](https://github.com/lambdasistemi/fido2box/security/advisories/new).
Describe the affected commit, prerequisites, and a reproduction with synthetic
data. Do not publish real box files, access tokens, PRF outputs, or secrets.

The current main branch is the maintained version. Recovery compatibility and
domain continuity must be considered before shipping changes to encryption,
credential enrollment, file formats, or deployment.
