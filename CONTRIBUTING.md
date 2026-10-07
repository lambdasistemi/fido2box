# Contributing

Use a focused branch and pull request linked to an issue. Record user-visible
acceptance criteria before implementation and ship documentation in the same
change. Read `.specify/memory/constitution.md`; global Spec Kit skills operate
on the repository's `.specify/` templates and scripts.

The constitution is the first gate: specify WHAT and WHY, clarify open
decisions, then plan HOW. Plans define changed module ownership and dependency
direction before data and function contracts. Keep feature logic in small,
focused modules; `app.js` composes them. Tasks map each behavior requirement to
automated proof. Documentation-only changes validate consistency and builds.
Record-format changes must prove legacy recovery and lossless round trips, and
must never treat UI masking as an encryption boundary.

Run `nix develop --quiet -c just ci` and `nix flake check --no-eval-cache`
before pushing. Run `just format` for repository configuration/documentation. A
missing Chromium installation must fail browser tests. Do not introduce runtime
dependencies or change vault formats without an explicit compatibility design.

Use Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`,
`test:`, `ci:`). Merge commits preserve signed branch commits; rebase-merging is
disabled. Keep generated output, local investigation notes, and `gate.sh` out of
Git.

CI runs on ephemeral GitHub-hosted Ubuntu runners with Nix-installed tooling.
Fork changes require workflow approval and run without repository secrets. Never
put production box files, tokens, PRF outputs, or recovery secrets into tests or
reports.

The quality setup is tracked in #17; cryptographic remediation belongs to #16.
