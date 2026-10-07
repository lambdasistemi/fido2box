# Repository quality

Issue: https://github.com/lambdasistemi/fido2box/issues/17

As a maintainer, I validate and release changes through a reproducible workflow
and observe that the published recovery app remains traceable to reviewed source.

## Requirements

- R1: One locked toolchain runs types, unit tests, real browser tests, formatting,
  workflow lint, and strict documentation builds locally and in CI.
- R2: Browser tests fail when Chromium is absent. A separate CI job exercises the
  development shell. Build Gate warms the derivations before downstream jobs.
- R3: Release automation opens CI-tested version PRs and publishes a static archive.
- R4: Main requires actual CI job names through a ruleset; standard labels,
  metadata, Actions permissions, and cache access are configured.
- R5: Documentation and a filled constitution describe use, development, release,
  trust boundaries, and the unresolved audit. Pages retains the app at its root
  and provenance verification of the app source.
- R6: A logbook records setup and any external prerequisites left outstanding.

## Non-goals

Cryptographic behavior changes (#16), UI changes (#15), npm publication, RP ID or
domain changes, and new third-party runtime dependencies in the recovery app.
