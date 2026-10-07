# Tasks: App audit notice

- [x] Add rendered-browser regression checks and observe RED without the notice.
- [x] Add static semantic notice and themed responsive styles.
- [x] Document notice and unchanged audit limitations.
- [x] Run full local CI and independent review; record evidence before delivery.

RED: the original app passed 110/120 browser checks; all ten new notice checks
failed. GREEN: the complete local CI passed with 23 core, 2 tooling, and 120
browser checks, plus formatting, lint, runtime boundary, and strict docs.
Independent parent review reran the full gate successfully and inspected phone
light and desktop dark screenshots. Application crypto/session code is
unchanged.

Hosted CI exposed a fixed-delay startup race in two existing assertions. With a
controlled 1.5-second first-module delay, the original test failed (115/120).
Replacing the fixed wait with bounded document/first-render readiness passed all
120 checks. The delay remains as regression coverage. Both agent and independent
parent full CI reruns passed; production code did not change.
