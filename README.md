# recover-box

Keep a few secrets behind a hardware key (FIDO2). One page, no accounts, no server logic.

Each **item** has three things: a title, **field 1** (an `https://` address to open) and **field 2** (a secret to copy). You plug in a key, press **Unlock**, enter its PIN and touch it. The page then lists your items: **Open** goes to field 1, **Copy** copies field 2 (and clears the clipboard after a minute).

It was made for "I lost every device: how do I get back into my password manager?" (field 1 = the sign-in page, field 2 = the Secret Key), but it knows nothing about any particular service.

## How it works, in plain words

1. The page makes a random **data key** and uses it to lock every item.
2. Each hardware key is asked for a secret number that only *that key* can recompute (WebAuthn PRF, i.e. the key's hmac-secret). The page uses it to lock a copy of the data key, once per key.
3. The public file `box.json` holds only the locked items, the locked data keys and each key's credential id. Titles, addresses and secrets are inside the locks.
4. To open: any enrolled key (PIN + touch) gives back its secret number, which unlocks the data key, which unlocks the items. In the browser, nothing is sent anywhere.

Details and limits: [AUDIT.md](AUDIT.md).

## The app

A single-page app for managing locked **boxes**. A box is one file holding items and the keys that open it.

- **Boxes:** the boxes in this browser (kept in IndexedDB, locked) and in a GitHub repository (`boxes/NAME.json`), with a status for each: in sync, ahead of GitHub, behind GitHub, only here, only on GitHub. New box, import a file.
- **A box:** *Items* (unlock with a key, then add, open, copy, delete), *Keys* (add, remove, detect which one is inserted), *Sync* (push, pull, download, delete from this browser).
- **Keys:** every key across your boxes, and which boxes it opens. A web page cannot see which key is plugged in until you touch it, so *Detect* asks the key to sign and matches the answer.
- **Settings:** the box repository (`owner/name`, remembered in this browser; `?repo=` also works) and an optional GitHub token for this session.

Every change to a box raises its `rev` and is saved in the browser at once. Nothing reaches GitHub until you press **Push**. Push refuses to overwrite a version with the same or a higher `rev`, and Pull asks first when your copy is newer. A GitHub token limited to the box repository (Contents: read and write) is kept as an item inside the box, so unlocking the box is what lets the app talk to GitHub; it is never shown. Fine-grained tokens expire, so renew it when GitHub refuses it.

Removing a key does not revoke it: anyone who ever had it can still open older copies of the box. To revoke, make a new box.

Rehearse on `http://localhost`: keys made there do not work on your real address.

## Keeping the boxes safe

A box file is the one thing you cannot recreate. The app and the site can always be rebuilt from this repository: if the site is lost, point the domain at a new host, deploy `web/`, and import your box. Keep boxes in GitHub (private repository) and download a copy of the ones you cannot lose. The domain cannot be replaced: keys are enrolled for it, so keep it renewed.

## Deployment

`.github/workflows/pages.yml` publishes `web/` to GitHub Pages on every push to `main`. It adds `COMMIT` and `SHA256SUMS` (the hash of every served file) and signs a provenance attestation for `SHA256SUMS`. `scripts/verify.sh https://fido2box.dev` checks that the live files match the signed list and the files in that commit; `.github/workflows/verify.yml` runs it every week. `web/config.js` sets the default box repository for this deployment. The code has no build step: the files in `web/` are what is served.

## Tests

`npm test` runs unit checks of the crypto and the GitHub helpers, then drives the real app in headless Chrome with a virtual security key (WebAuthn with PRF), IndexedDB and a fake GitHub. It needs Chrome or Chromium on the path, and is skipped without it. `npx tsc -p tsconfig.json` type-checks the modules from their JSDoc (the source is what is served: there is no build).
