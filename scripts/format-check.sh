#!/usr/bin/env bash
set -euo pipefail
nixfmt --check flake.nix nix/*.nix
prettier --check .github docs specs mkdocs.yml .prettierrc.json release-please-config.json .release-please-manifest.json package.json package-lock.json README.md CONTRIBUTING.md SECURITY.md
