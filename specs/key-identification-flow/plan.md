# Plan

Replace the nickname-first picker with identification and explicit manual paths.
Reuse recognized credential IDs with a fresh PRF request when wrapping the new
box data key. Use WebAuthn excludeCredentials for manual enrollment to reject
known hardware. Keep failures inconclusive and forms intact. Share metadata
collection across the picker and Security keys page. Update help and browser
coverage using real virtual authenticators, including locked boxes, duplicate
attempts, cancelled detection, hardware swaps, and optional nicknames.
