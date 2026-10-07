# Plan

## Design

Keep the browser app as directly served ES modules. Package its files as the
default Nix output; provide separate docs and combined Pages outputs. Use locked
nixpkgs and the shared dev-assets MkDocs environment. Verification apps and Nix
checks execute the same scripts. Keep the developer shell exercised by CI.

Publish app files at `/` and generated documentation at `/docs/` in one Pages
artifact. Preserve the existing app COMMIT/SHA256SUMS verification contract and
add a separate signed manifest for the complete generated site. No CDN scripts
or external fonts are introduced by the docs theme.

Use release-please manifest mode for the private Node project. Mint a repository
scoped GitHub App token from the existing organization credentials so release
PRs trigger checks. Attach the source-equivalent static app archive to releases;
do not publish to npm.

Use GitHub-hosted `ubuntu-24.04` runners and least-privilege workflow
permissions, per the maintainer's explicit override of the initial self-hosted
plan. Install Nix and configure Cachix in every Nix job; stores are not shared
between jobs. Fork PRs run after workflow approval without repository secrets.
Require Build Gate, CI build, CI format, Docs build, and Dev shell checks
through a main ruleset, with the standard admin bypass.

## Validation

Baseline: existing TypeScript and 23 unit / 65 Chrome checks. Final: Nix checks,
`nix develop --quiet -c just ci`, negative control for missing Chromium, static
site smoke, workflow lint, and PR CI. Inspect live repository settings after
mutation. Keep application source byte-identical to the reviewed base.
