set shell := ["bash", "-euo", "pipefail", "-c"]

default:
    @just --list

typecheck:
    tsc -p tsconfig.json

unit:
    node test/box.test.js
    node test/tooling.test.cjs

browser:
    node test/browser.test.js

format-check:
    bash scripts/format-check.sh

format:
    nixfmt flake.nix nix/*.nix
    prettier --write .github docs specs mkdocs.yml .prettierrc.json release-please-config.json .release-please-manifest.json package.json package-lock.json README.md CONTRIBUTING.md SECURITY.md

lint:
    actionlint .github/workflows/*.yml
    shellcheck scripts/*.sh
    node scripts/check-runtime.cjs

build-docs:
    mkdocs build --strict

proofs:
    bash scripts/check-record-proofs.sh

serve-docs:
    mkdocs serve --dev-addr 127.0.0.1:8001

serve:
    python3 -m http.server 8000 --bind 127.0.0.1 --directory web

ci: typecheck unit browser format-check lint build-docs proofs

build:
    nix build .#site

verify-live:
    bash scripts/verify.sh https://fido2box.dev
