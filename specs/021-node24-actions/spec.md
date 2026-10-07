# Supported GitHub Actions runtimes

Issue: https://github.com/lambdasistemi/fido2box/issues/21

Maintainers should see successful hosted checks without Node.js 20 deprecation
annotations. Replace the retired Cachix dependency in every workflow, including
Pages, release publishing, and scheduled verification. Preserve public cache
reads without secrets, authenticated uploads, required check names, permissions,
and hosted runner labels. Do not change application code or other repositories.

Accept only after local gates pass and a new hosted CI run has no Node.js 20
annotations. Historical run warnings are immutable and are not in scope.
