# Tasks

- [x] Establish the baseline (23 unit and 85 browser checks) and verify the new
      acceptance check fails without Documentation/help.
- [x] Add the Documentation tab and eight-topic guide.
- [x] Add contextual help dialogs and a persistent Settings control.
- [x] Verify keyboard behavior, retained form values, reloads, blocked storage,
      and 320px phone layouts in both themes.
- [x] Update user documentation and pass all local checks: 23 crypto/GitHub
      checks, 110 Chrome browser checks, JSDoc type checking, and the
      runtime-import guard.

The initial focus check exposed Tab leaving the native dialog for browser
chrome. A focused reproduction confirmed the boundary behavior; explicit
forward/reverse wrapping now passes along with Escape focus restoration.
