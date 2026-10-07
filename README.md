# fido2box

Keep a few secrets behind a hardware key (FIDO2). One page, no accounts, no
server logic.

Each **record** has a title and any number of named fields. Keep account names,
recovery keys, backup codes, addresses and instructions together. No URL or
password is required. Plug in an enrolled key, press **Unlock**, verify yourself
and touch it. Each value has **Copy**; permitted URL values are links. Hidden
values stay concealed until **Reveal**, and the clipboard clear after a minute
is best effort.

It was made for "I lost every device: how do I get back into my password
manager?", but it knows nothing about any particular service.

## How it works, in plain words

1. The page makes a random **data key** and uses it to lock every item.
2. Each hardware key is asked for a secret number that only _that key_ can
   recompute (WebAuthn PRF, i.e. the key's hmac-secret). The page uses it to
   lock a copy of the data key, once per key.
3. The public file `box.json` holds only the locked items, the locked data keys
   and each key's credential id. Titles, addresses and secrets are inside the
   locks.
4. To open: any enrolled key (PIN + touch) gives back its secret number, which
   unlocks the data key, which unlocks the items. In the browser, nothing is
   sent anywhere.

Details and limits: [AUDIT.md](AUDIT.md).

## The app

A single-page app for managing locked **boxes**. A box is one file holding items
and the keys that open it.

Every app page warns that fido2box is experimental and not independently
audited: do not rely on it as your only recovery copy. The notice links to the
[security limitations](https://fido2box.dev/docs/security/) and stays visible
when inline help is off.

- **Boxes:** the boxes in this browser (kept in IndexedDB, locked) and in a
  GitHub repository (`boxes/NAME.json`), with a status for each: in sync, ahead
  of GitHub, behind GitHub, only here, only on GitHub. New box, import a file.
- **A box:** _Items_ (unlock, create/edit records, reveal, copy and delete),
  _Keys_ (add, remove, detect which one is inserted), _Sync_ (push, pull,
  download, delete from this browser).
- **Keys:** every key across your boxes, and which boxes it opens. A web page
  cannot see which key is plugged in until you touch it, so _Detect_ asks the
  key to sign and matches the answer.
- **Settings:** the box repository (`owner/name`, remembered in this browser;
  `?repo=` also works) and an optional GitHub token for this session.

- **Documentation:** an in-app guide to boxes, items, keys, GitHub backups,
  tokens, and recovery. Topic links can be bookmarked or shared. The guide and
  app footer also link to the published project documentation at `/docs/`.

Question-mark buttons open contextual help without discarding the form you are
filling in. Close the popup with **Close**, **Escape**, or a click outside it;
**Read the full guide** opens the matching Documentation section. In **Settings
→ Help and documentation**, turn **Show inline help** on or off. It starts
enabled, applies immediately, and is remembered across reloads in this browser.
Documentation remains available when inline help is off. If browser storage is
unavailable, the setting applies until reload and the page explains that it
could not be saved.

Choose **Light**, **Dark**, or **System** in the header on any page. Your choice
is remembered in this browser. System follows your device's appearance,
including changes while the page is open. If browser storage is blocked, the
controls still work for the current page. On phones, box and item lists stack so
the actions remain visible. Form labels, visible keyboard focus, box links, and
a Skip to content link support keyboard navigation.

Saving a record or changing keys/tokens raises the box's `rev` after the
encrypted write succeeds. Unsaved record drafts remain only in memory. Nothing
reaches GitHub until you press **Push**. Push refuses to overwrite a version
with the same or a higher `rev`, and Pull asks first when your copy is newer. A
GitHub token limited to the box repository (Contents: read and write) is kept as
a separate encrypted service record, so unlocking the box lets the app talk to
GitHub; it is never shown. Fine-grained tokens expire, so renew it when GitHub
refuses it.

## What you can do with recovery records

<!-- diagram: recovery-path -->

![Import an encrypted backup, unlock with an enrolled key, then use or edit records.](docs/assets/recovery-path.svg)

The file remains encrypted in storage; unlocked records live in memory.
[Diagram source](docs/assets/recovery-path.mmd).

Choose **New record** and add optional suggestions or custom fields. Text,
multiline and URL kinds are independent of the **Hidden when viewing** setting.
Custom fields start hidden; duplicate names and empty values are allowed.
Existing hidden values stay out of form controls until **Reveal** or
**Replace**; Replace starts empty. Optional confirmation starts off and checks
exact spaces and line breaks when enabled. It is never saved. Cancel preserves
the saved record; Lock discards the draft immediately.

Old boxes open without rewriting. Their first edit asks permission to migrate to
v3 and retains a verified encrypted original first. Download it from **Retained
backups** in Boxes or Sync, even after deleting the active box. Older releases
cannot safely edit v3, and the original backup cannot recover later edits.
Unsupported data makes the whole box read-only, with the original file still
downloadable. Pull clears the old unlocked session; unlock the fetched box
before editing it. See [recovery and backups](docs/recovery.md).

Removing a key does not revoke it: anyone who ever had it can still open older
copies of the box. To revoke, make a new box.

Rehearse on `http://localhost`: keys made there do not work on your real
address.

## Keeping the boxes safe

A box file is the one thing you cannot recreate. The app and the site can always
be rebuilt from this repository: if the site is lost, point the domain at a new
host, deploy `web/`, and import your box. Keep boxes in GitHub (private
repository) and download a copy of the ones you cannot lose. The domain cannot
be replaced: keys are enrolled for it, so keep it renewed.

## Deployment

`.github/workflows/pages.yml` publishes the app at the domain root and generated
documentation at `/docs/` on pushes to `main`. `COMMIT` and the signed
`SHA256SUMS` identify the unbundled app files; a separate signed
`SITE-SHA256SUMS` covers the complete generated site.
`scripts/verify.sh https://fido2box.dev` checks that the live app matches its
signed list and source commit; the verification workflow runs weekly.
`web/config.js` sets the default box repository. The app has no build step: the
files in `web/` are what is served.

## Development and documentation

Use the locked Nix toolchain on x86_64 Linux:

```sh
nix develop --quiet -c just ci
nix flake check --no-eval-cache
nix build .#site
```

The [documentation](https://fido2box.dev/docs/) covers recovery, security,
development, releases, and deployment. See [CONTRIBUTING.md](CONTRIBUTING.md)
and [SECURITY.md](SECURITY.md). The unresolved findings in
[issue #16](https://github.com/lambdasistemi/fido2box/issues/16) remain
applicable.

## Tests

`npm test` runs unit checks of the crypto and the GitHub helpers, then drives
the real app in headless Chrome with a virtual security key (WebAuthn with PRF),
IndexedDB and a fake GitHub. It requires Chrome or Chromium on the path and
fails without it; the Nix shell supplies Chromium. `just typecheck` type-checks
all app modules from their JSDoc (the source is what is served: there is no
build).

## License

[Apache-2.0](LICENSE).
