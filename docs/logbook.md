# Development logbook

## Wednesday 7 October 2026

### Repository quality setup (PV)

[Issue #17](https://github.com/lambdasistemi/fido2box/issues/17) and
[PR #18](https://github.com/lambdasistemi/fido2box/pull/18) introduce
reproducible tooling, mandatory browser coverage, release automation, protected
main, and documentation. The baseline passed 23 unit checks and 65 browser
checks.

The maintainer requested GitHub-hosted runners in place of the initial NixOS
runner plan. All workflows now target `ubuntu-24.04` and install Nix per job.
The rebased browser suite includes the merged theme/UI coverage (85 checks). The
test harness isolates Chromium configuration and the Nix toolchain supplies
fonts, so sandboxed checks do not depend on the host desktop environment.

The separate
[cryptographic audit](https://github.com/lambdasistemi/fido2box/issues/16)
remains open. Repository setup does not change the app's cryptography.

The GitHub wiki is enabled but its Git repository has not yet been initialized.
This tracked logbook is available until the wiki can be initialized and
mirrored.
