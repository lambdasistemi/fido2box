# Theme and interface improvements

Users can choose Light, Dark, or System from every page. The choice survives
reloads; System follows operating-system changes. An unavailable browser storage
API does not prevent theme changes or app startup. Theme controls remain
keyboard accessible and announce their selection.

The app has a clear page hierarchy, readable forms, obvious primary actions,
accessible links and focus indicators, and navigation that fits on a phone.
Boxes have links usable with a keyboard. The existing encrypted-box,
security-key, and sync flows keep their behavior.

Acceptance: real Chrome verifies theme colors, persistence, system changes,
denied storage, navigation, and phone layouts; the existing crypto and browser
suites and JSDoc type check pass. No external runtime dependency is introduced.
