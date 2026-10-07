# Releases and deployment

Main requires the CI Build Gate, CI build, CI format, Docs build, and Dev shell
checks. All jobs use GitHub-hosted `ubuntu-24.04` runners, as requested by the
maintainer. Each Nix job installs Nix and configures the shared Cachix cache;
jobs do not assume a shared machine or store. Build Gate realizes the site,
shell, and sandboxed checks before dependent jobs run.

All external contributors require workflow approval. Approved fork PRs run on
ephemeral GitHub-hosted runners with read-only repository permissions and no
repository secrets. They can read the public cache without upload credentials.
Administrative bypass is reserved for recovery, not ordinary delivery.

Release-please uses manifest mode for the private Node project. Conventional
`feat:` and `fix:` commits drive version PRs; maintenance commits accumulate.
`CI_APP_ID` and `CI_APP_PRIVATE_KEY` mint a repository-scoped token so
bot-created PRs trigger CI. They are existing organization settings, not files
in this repo. `CACHIX_AUTH_TOKEN` is also supplied by the organization.

Merging a release PR publishes a GitHub release with `fido2box.tar.gz` and its
SHA-256 checksum. There is no npm publication. A missing app credential fails
the release workflow rather than silently creating a PR with suppressed checks.

Pages publishes one artifact: the unbundled app at `/` and strict MkDocs output
at `/docs/`. `COMMIT` identifies the source revision. The signed `SHA256SUMS`
manifest covers the app files and commit, preserving source comparisons:

```sh
nix develop --quiet -c just verify-live
```

`SITE-SHA256SUMS` additionally covers the generated docs and the app manifest
and receives a provenance attestation in the same build. To inspect those bytes,
download it, verify with
`gh attestation verify SITE-SHA256SUMS -R lambdasistemi/fido2box`, and check its
listed files. The weekly app verification remains independently scheduled.
Retain ownership of `fido2box.dev`; changing the RP ID breaks recovery with
existing credentials.
