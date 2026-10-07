# App audit notice

## User story

As a recovery-app visitor, I see that the software is experimental and not
independently audited before relying on it for my recovery secrets.

## Acceptance

- A persistent static notice appears on every app route, locked or unlocked.
- It says the app is experimental and not independently audited, and warns
  against relying on it as the only recovery copy.
- A keyboard-accessible Security limitations link opens /docs/security/ in a
  separate context with noopener/noreferrer, preserving the current app session.
- Disabling inline help does not hide the notice; it is not dismissible.
- Notice text and link remain visible in both themes and at 320 CSS pixels
  without horizontal page overflow.
- Real-browser tests demonstrate absence before the change and presence after
  it.

## Non-goals

No cryptographic changes, audit-completion claims, onboarding modal, analytics,
new dependencies, or expressive-record implementation.
