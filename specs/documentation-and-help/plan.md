# Plan

Use a self-contained, JSDoc-checked guidance module for static documentation
content, the help preference, and a shared native dialog. Render all content as
DOM text. Keep help separate from box state and never put secrets into the guide
or popups.

Add the Documentation route and contextual buttons to the existing UI. Add a
checkbox in Settings that updates help controls in place, preserving other field
values. Use the existing theme tokens and a two-by-two navigation layout on
narrow screens.

Extend the real Chrome suite for the new behavior, including a keyboard-opened
dialog and Escape dismissal. Inspect desktop and phone screenshots. Run the
complete test suite, type check, and runtime import guard before publishing.
