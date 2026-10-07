#!/usr/bin/env bash
# Check that the files served at SITE are the ones built from this repository.
#   scripts/verify.sh https://fido2box.dev
# Needs: curl, git, sha256sum, and gh (logged in) for the attestation check.
set -euo pipefail
SITE=${1:?usage: verify.sh https://site}
REPO=${REPO:-lambdasistemi/fido2box}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
curl -fsS "$SITE/SHA256SUMS" -o "$tmp/SHA256SUMS"
commit=$(curl -fsS "$SITE/COMMIT" | tr -d '[:space:]')
echo "site claims commit $commit"
echo "== signed provenance of SHA256SUMS"
gh attestation verify "$tmp/SHA256SUMS" -R "$REPO" >/dev/null && echo "ok: built by $REPO"
echo "== every served file matches the signed list"
bad=0
while read -r sum file; do
  file=${file#./}
  got=$(curl -fsS "$SITE/$file" | sha256sum | cut -d' ' -f1)
  if [ "$got" = "$sum" ]; then echo "ok  $file"; else echo "DIFFERS  $file"; bad=1; fi
done < "$tmp/SHA256SUMS"
echo "== files in that commit match too"
while read -r sum file; do
  file=${file#./}; [ "$file" = COMMIT ] && continue
  got=$(git show "$commit:web/$file" | sha256sum | cut -d' ' -f1)
  if [ "$got" = "$sum" ]; then echo "ok  $file"; else echo "DIFFERS from repo  $file"; bad=1; fi
done < "$tmp/SHA256SUMS"
if [ "$bad" = 0 ]; then echo "VERIFIED"; else echo "MISMATCH"; exit 1; fi
