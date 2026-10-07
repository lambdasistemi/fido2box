# Tasks

- [x] Verify the baseline and record failing appearance tests (23 unit checks
      and 65 browser checks; missing controls fail the new check).
- [x] Add persisted Light / Dark / System selection.
- [x] Improve responsive layout, form labels, and keyboard navigation.
- [x] Document appearance controls and inspect desktop and 320px phone
      screenshots.
- [x] Run JSDoc type checking, 23 crypto/GitHub checks, 85 Chrome browser
      checks, and the no-external-imports check.

The environment began blocking local TCP listeners partway through the work.
Final browser validation ran the existing CDP test assertions through the
connected Playwright browser, fulfilling the exact local web files through
browser routing; the app still used real IndexedDB and Chrome's virtual WebAuthn
PRF authenticator. The normal npm test command remains the CI gate.

Delivery PR: https://github.com/lambdasistemi/fido2box/pull/15
