# Modules Model: Expressive recovery records

Authored before the data and function models. Only changed owners are listed.
Fields/invariants live in [data-model.md](data-model.md); public callable shapes
live in [functions-model.md](functions-model.md). Flat local ES modules keep the
existing runtime/deployment boundary.

## `web/records.js`

- **Status**: new pure domain owner.
- **Responsibility**: recovery records, validation, suggestions, immutable
  drafts.
- **Owns abstractions**: RecoveryRecord, Field, RecordDraft, DraftChange,
  ValidationIssue.
- **Upstream dependencies**: none.
- **Downstream consumers**: record-codec, record-editor, record-view,
  record-session.
- **Promotions**: record validation from app to this owner; FR-001–003; editor
  and codec.
- **Forbidden dependencies**: crypto, DOM, clipboard, persistence, networking.

## `web/record-codec.js`

- **Status**: new pure format owner.
- **Responsibility**: legacy interpretation and versioned payload serialization.
- **Owns abstractions**: Payload, ServiceRecord, DecodeResult.
- **Upstream dependencies**: records.
- **Downstream consumers**: box-session.
- **Promotions**: parseItem/schema projection from crypto; FR-007–010.
- **Forbidden dependencies**: browser effects, encryption, storage, networking.

## `web/box-format.js`

- **Status**: new pure envelope owner.
- **Responsibility**: supported box shapes and write eligibility.
- **Owns abstractions**: Box, KeyEntry, Sealed, SourceDocument, BoxInspection.
- **Upstream dependencies**: none.
- **Downstream consumers**: box-session, store, github, webauthn, app, crypto
  (types).
- **Promotions**: envelope types/keysOf/emptyVault from crypto; all box
  consumers.
- **Forbidden dependencies**: record UI, clipboard, storage, networking,
  WebAuthn effects.

## `web/crypto.js`

- **Status**: changed existing owner.
- **Responsibility**: byte/text encryption and data-key wrapping only.
- **Owns abstractions**: cryptographic operations; no record schema.
- **Upstream dependencies**: box-format types.
- **Downstream consumers**: box-session, webauthn, github.
- **Promotions**: format interpretation leaves for box-format and record-codec.
- **Forbidden dependencies**: record semantics, DOM, storage, networking.

## `web/store.js`

- **Status**: changed existing owner.
- **Responsibility**: encrypted library and immutable backup persistence.
- **Owns abstractions**: StoredBox, Backup, SourceIdentity, storage error codes.
- **Upstream dependencies**: box-format types.
- **Downstream consumers**: box-session, app (listing/download only).
- **Promotions**: guarded persistence required by every mutation; FR-007–009.
- **Forbidden dependencies**: plaintext records, key material, UI, network.

## `web/box-session.js`

- **Status**: new effect coordinator.
- **Responsibility**: unlocked box lifecycle and guarded mutations.
- **Owns abstractions**: SessionToken, SessionView, BoxMutation,
  BoxSessionPorts.
- **Upstream dependencies**: box-format, record-codec, records, crypto, store.
- **Downstream consumers**: app and record-session through injected ports.
- **Promotions**: app unlock/commit/session cache; record, key, token and Pull
  callers.
- **Forbidden dependencies**: DOM, clipboard and networking imports;
  authenticator operations are injected, not performed by domain owners.

## `web/dom.js`

- **Status**: new shared presentation primitive.
- **Responsibility**: literal-text element construction and common input
  attributes.
- **Owns abstractions**: Child, ElementProps.
- **Upstream dependencies**: DOM only.
- **Downstream consumers**: app, record-view, record-editor.
- **Promotions**: app h helper; three composition consumers; FR-011.
- **Forbidden dependencies**: record semantics, persistence, crypto, networking.

## `web/record-view.js`

- **Status**: new presentation owner.
- **Responsibility**: read-only record and field controls.
- **Owns abstractions**: RecordViewActions.
- **Upstream dependencies**: records, dom, existing url policy.
- **Downstream consumers**: record-session.
- **Promotions**: record display from app; FR-004–006, FR-011.
- **Forbidden dependencies**: direct clipboard/storage/network/key effects.

## `web/record-editor.js`

- **Status**: new presentation owner.
- **Responsibility**: draft controls, validation display, editor focus.
- **Owns abstractions**: EditorPresentation, RecordEditorActions.
- **Upstream dependencies**: records, dom.
- **Downstream consumers**: record-session.
- **Promotions**: editor from app; FR-001–003, FR-006, FR-011.
- **Forbidden dependencies**: direct persistence, clipboard, crypto and
  networking.

## `web/record-session.js`

- **Status**: new feature controller.
- **Responsibility**: one active record interaction and its departure lifecycle.
- **Owns abstractions**: RecordSession, RecordSessionPorts.
- **Upstream dependencies**: records, record-view, record-editor; injected
  effect ports.
- **Downstream consumers**: app.
- **Promotions**: draft/reveal/navigation state from app; FR-001–007, FR-011.
- **Forbidden dependencies**: direct storage, networking and crypto; no global
  app state.

## `web/clipboard.js`

- **Status**: new browser-effect owner.
- **Responsibility**: copying and conditional best-effort clearing.
- **Owns abstractions**: ClipboardPorts, ClipboardController, CopyResult.
- **Upstream dependencies**: injected clipboard/timer/notice ports.
- **Downstream consumers**: app supplies its controller to record-session.
- **Promotions**: app copy handler and timer; all field kinds share one owner.
- **Forbidden dependencies**: record model, DOM composition, storage and crypto.

## Existing integration owners

- **Status**: changed app.js, github.js, webauthn.js; existing url.js policy
  retained.
- **Responsibility**: app composes controllers/routes; github transports
  encrypted source; webauthn manages authenticators. No extra generic service
  layer.
- **Owns abstractions**: App routing, Fetch; unchanged WebAuthn result types.
- **Upstream dependencies**: app composes the owners above; github uses crypto
  encoding and box-format; webauthn uses crypto and box-format.
- **Downstream consumers**: page entry point.
- **Promotions**: ownership extracted as described above, not duplicated.
- **Forbidden dependencies**: domain-to-app imports and private field logic
  added back to app. Unrelated help/theme/key-label screens remain in place.
