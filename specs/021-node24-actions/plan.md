# Plan

The shared setup helper nests `cachix/cachix-action@v15`, whose action metadata
declares Node.js 20. Its current upstream version still uses v15. Introduce one
local composite action using the existing Nix installer and Cachix v17 (Node.js
24), then replace all nine setup calls. Preserve the public cache and skip cache
uploads when no token is available. This local exception to the shared setup
convention avoids changing another repository or hiding warnings.

Add a regression guard to the existing tooling tests, prove it fails before the
workflow changes, and run both Nix checks and the development-shell gate.
Inspect direct and nested action metadata and the new GitHub run annotations.
Record hosted evidence in the PR before readiness.
