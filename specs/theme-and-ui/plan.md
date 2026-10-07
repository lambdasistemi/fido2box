# Implementation plan

Add a small theme module initialized before the stylesheet. Store only the appearance preference in localStorage, use CSS tokens for both palettes, and expose a three-button selection in the header. Preserve the strict self-only content security policy.

Refine CSS layout, typography, cards, fields, empty states, and mobile tables. Add explicit labels to fields and keyboard-accessible box links. Keep crypto, WebAuthn, storage, and GitHub modules unchanged.

Extend the existing Chrome CDP suite for appearance and accessibility behavior; inspect desktop and phone screenshots. Run the repository's CI commands locally before pushing.
