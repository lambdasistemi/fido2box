# Security boundaries

fido2box is experimental and has not been independently audited. Do not rely on
it as your only recovery copy. A persistent notice on every app page links here;
it remains visible with a box unlocked or inline help disabled. The link opens
separately so the current app session stays available.

The core uses WebCrypto: a random 256-bit data key, AES-256-GCM with fresh
random 96-bit IVs, and HKDF-SHA-256 over a credential's WebAuthn PRF output.
Unlocking requires user verification and checks the UV flag. User verification
is not necessarily a PIN, and enrollment currently also permits platform
authenticators.

The [2026-10-06 review](https://github.com/lambdasistemi/fido2box/issues/16)
identified stale unlocked state after Pull, continued access after removing a
key, unauthenticated vault structure/revision, and a gap between hardware-key
claims and enrollment policy. The record implementation now invalidates old
sessions on Pull and checks the complete saved source before writing; regression
tests cover replacement with another data key at the same revision. The other
findings remain unresolved. This is not a cryptographic certification or an
independent audit.

Individual ciphertext authentication rejects bit changes but does not reject all
file modifications. The current format permits deletion and replay of records.
Rejecting a complete historical vault also requires trusted freshness state
outside the file.

The browser receives plaintext and raw data-key material while unlocked.
Delivered JavaScript, browser extensions, the OS, and authenticator
implementation remain trusted. Provenance lets an operator inspect served bytes;
it does not stop a compromised origin from serving malicious code during an
unlock.

Documentation shares the app origin. Its build dependencies are locked and its
assets are local; there are no external fonts or CDN scripts. Changes to docs
assets deserve the same origin-trust review as changes to the app.

Clipboard contents can be read by other software. Clearing after a minute is
best-effort and can fail if the page is closed or unfocused. The delayed attempt
compares an ephemeral SHA-256 fingerprint before clearing and leaves different
clipboard content alone. Lock does not cancel the attempt; clipboard history and
other applications are outside its control. Hidden and visible fields receive
the same encryption; hiding is presentation, not protection from an unlocked
browser. Keep secrets out of issues, screenshots, logs, and test fixtures. See
the repository's
[security policy](https://github.com/lambdasistemi/fido2box/blob/main/SECURITY.md).
