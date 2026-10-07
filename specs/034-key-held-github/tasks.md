# Deliver key-first recovery

- [x] Record the circular-dependency report, operator ruling and existing solo
      authority.
- [x] Inspect the actual token, key-label, discovery and sync paths.
- [x] Demonstrate WebAuthn key storage and recovery with all browser stores
      empty.
- [x] Establish module, data and function contracts before implementation.
- [ ] Reproduce the missing first-use flow against the actual app.
- [ ] Execute failing codec/authenticator/session controls, then implement their
      owners.
- [ ] Integrate first-use setup, key connection and renewal; preserve legacy
      recovery.
- [ ] Guard stale key/network completion and connection changes during
      synchronization.
- [ ] Exercise setup, complete browser-state removal, connect, pull and
      enrolled-key unlock through the UI.
- [ ] Verify capability refusals, UV, wrong credential, corrupt profiles,
      write/readback failures and canceled work.
- [ ] Update guidance and design documentation, render and inspect diagrams, and
      verify narrow-screen/keyboard interactions.
- [ ] Run types, unit/browser, full local and flake checks, built-site smoke and
      hosted CI.
- [ ] Record physical-device evidence separately from virtual-authenticator
      checks and resolve any remaining delivery decision.
