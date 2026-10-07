# Plan: App audit notice

Constitution 1.1.0 applies. This is a static notice, not a cryptographic fix.

- Put a semantic, named notice in web/index.html outside the replaceable app
  main.
- Reuse existing light/dark color tokens and narrow-layout spacing in app.css.
- Extend the existing CDP browser suite for actual rendered visibility, route
  persistence, help preference independence, unlocked/locked states, link
  safety, keyboard focus, and mobile/theme layouts. Demonstrate RED before
  markup changes.
- Update README and security documentation in the same change.
- Verify with nix develop --quiet -c just ci and an independent review.

No new module, function, record format, or runtime dependency is required.
Application crypto/session logic remains untouched.
