# Development

The supported reproducible toolchain is Nix on x86_64 Linux. Node 24,
TypeScript, Chromium, Just, formatters, linters, and the shared MkDocs
environment are pinned through `flake.lock`. No npm installation is needed
inside the Nix shell; the TypeScript tool is supplied by Nix.
`package-lock.json` remains available for manual npm development.

```sh
nix develop
just ci
just serve
```

`just serve` opens the app on `http://localhost:8000`. Credentials made there
are for rehearsal and cannot unlock production boxes. `just serve-docs` uses
port 8001.

```sh
nix flake check --no-eval-cache
nix develop --quiet -c just ci
nix build .#site
nix develop --quiet -c bash scripts/smoke-site.sh result
```

Flake checks actually execute their matching apps in the sandbox: typecheck,
unit, browser, format-check, lint, and docs-check. CI also enters the
development shell and runs the full local command. Chromium is mandatory: absent
browser coverage is a failure, not a passing skip. Browser tests use a virtual
PRF authenticator and a fake GitHub API; test real hardware separately.

Use `just format` and `just format-check` for Nix and repository
configuration/docs. Existing compact JavaScript style is preserved; JSDoc type
checks cover the six core modules listed in `tsconfig.json`, not `app.js`.
Workflow lint and shellcheck run through `just lint`. The app's dependency
boundary remains checked too.

Read the
[contribution guide](https://github.com/lambdasistemi/fido2box/blob/main/CONTRIBUTING.md)
and project constitution before changing behavior. Specifications for repository
setup live in `specs/017-repository-quality/`.
