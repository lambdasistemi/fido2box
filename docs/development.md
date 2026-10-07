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
checks cover the core modules listed in `tsconfig.json`, not `app.js`. Workflow
lint and shellcheck run through `just lint`. The app's dependency boundary
remains checked too.

Read the
[contribution guide](https://github.com/lambdasistemi/fido2box/blob/main/CONTRIBUTING.md)
and project constitution before changing behavior. Specifications for repository
setup live in `specs/017-repository-quality/`.

## Spec-driven changes

Constitution 1.1.0 is the governing baseline for new feature work. Write the
user-visible specification and resolve unclear requirements before designing
implementation. During planning, write `modules-model.md` first, then
`data-model.md` and `functions-model.md`, covering only changed boundaries.
Generate acceptance-linked tasks only after these contracts agree.

Keep each module focused: pure record/validation logic must not import DOM,
storage, clipboard, or networking. UI composition and browser effects have
separate owners. New modules participate in the relevant type and test gates.
Record changes require legacy fixtures and lossless round-trip tests; field UI
changes require safe-link, copy/reveal, lock/reset, and accessibility coverage.
The templates contain explicit constitution checks rather than optional test
placeholders. This amendment does not implement expressive records or change the
current three-field app behavior.
