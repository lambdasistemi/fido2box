#!/usr/bin/env bash
set -euo pipefail
node scripts/smoke-site.cjs "${1:?usage: smoke-site.sh directory}"
