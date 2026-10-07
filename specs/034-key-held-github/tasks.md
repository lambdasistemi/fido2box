# Deliver key-first recovery

- [x] Record the circular-dependency report, operator ruling and existing solo
      authority.
- [x] Inspect the actual token, key-label, discovery and sync paths.
- [x] Demonstrate WebAuthn key storage and recovery with all browser stores
      empty.
- [x] Establish module, data and function contracts before implementation.
- [x] Reproduce the missing first-use flow against the actual app: baseline
      198/199, with only the new empty-library connection assertion failing.
- [x] Implement codec/authenticator/session owners and exercise their failure
      controls. These module controls were added after implementation; only the
      actual first-use UI has pre-implementation RED evidence.
- [x] Integrate first-use setup, key connection and renewal; preserve legacy
      recovery.
- [x] Guard stale key/network completion and connection changes during
      synchronization.
- [x] Exercise setup, complete browser-state removal, connect, pull and
      enrolled-key unlock through the UI.
- [x] Verify capability refusals, UV, wrong credential, corrupt profiles,
      write/readback failures and canceled work.
- [x] Update guidance and design documentation, render and inspect diagrams, and
      verify narrow-screen/keyboard interactions.
- [x] Run types, unit/browser, full local and flake checks, and built-site
      smoke. Full local CI passed at 225 browser checks; the subsequent Nix gate
      passed 226 including disconnect during Pull. Existing twelve
      record/session theorems remain unchanged; they make no claim about key
      storage.
- [ ] Run hosted CI and publish the user-authorized preview.
- [ ] Receive the user's physical-device test. Preview publication is
      authorized; production merge and independent review remain separate from
      this test.
