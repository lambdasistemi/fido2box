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

## Use it

1. Host the `web/` folder over **https** at the address you will always use. A key's lock is tied to the page's host name (or to a `<meta name="rp-id" content="example.org">` you set), so enrol the keys on the final address.
2. Open `index.html`, press **Make a new box**, **add items**, **add a key** (PIN and touch, twice) and **save the box**: you get a file. A box is just that one locked file.
3. Where the file lives is up to you. Put it on the site as `boxes/NAME.json` (list the names in `boxes/index.json`, e.g. `["paolo","wife"]`), or keep it anywhere and open it from the page with **Open a box file from this computer** (it is read in the browser and never sent). `?box=NAME` preselects a box on the site.
4. From then on `index.html` is the button you give to someone.
5. `?lang=it` shows Italian.

Add more keys later: open `index.html`, unlock with a key already in the box, press **Edit this box**, add the new one, save the box and replace the old file.

Rehearse on `http://localhost` first: keys added there do not work on your real address.

## What you give up (read this)

- **The host you serve it from is trusted at the moment you use it.** The page's code runs in your browser and sees the decrypted secrets. Whoever can change the files on that server could change the code. HTTPS protects the transit, not a compromised server.
- **Anyone holding one enrolled key and its PIN can open the box.** Eight wrong PINs wipe most keys, but that is a property of the key, not of this code. There is no password: the key and its PIN are the whole protection.
- **No revocation.** Removing a key from the file does not change the data key. If a key is lost, make a new box and re-enrol the keys you still have.
- The number of items and the key credential ids are visible in the public file.

## Support

- Needs a browser with WebAuthn PRF and a key with hmac-secret: Chrome and Edge on desktop; Firefox on Linux (tested 157). Firefox on macOS is reported broken. Windows 10 is reported problematic. Many security keys qualify (tested: Token2 PIN+ Release 3.3).
- **Tested**: unit tests of the crypto with simulated keys, and end-to-end tests of the real pages in jsdom with a simulated key (`npm test`); manual runs with a real key in Chrome and Firefox on Ubuntu.
- **Not tested**: macOS, Windows, Safari, Android.
- **Not independently audited.** Do not make it your only way back into anything that matters.

## Develop

    npm install
    npm test

The run-time code has no dependencies: `web/box.js` and the two pages use only built-in browser APIs (Web Crypto, WebAuthn, fetch, clipboard). `jsdom` is used only by the tests.

## Licence

Apache-2.0.

## Keeping the box safe

The box file is the one thing you cannot recreate. The page and the server can always be rebuilt from this repository: if the server is lost, point the same domain at a new one, deploy `web/`, and put the box file back. Keep copies of the file: **Download a copy of this box** is available as soon as a box is chosen, without unlocking. Every saved edit raises the box's `rev`; when you open a file from your computer the page tells you whether it is the same as, newer than, or older than the website's copy. The domain itself cannot be replaced: keys are enrolled for it.

The repository that holds your box file (for example `owner/fido-box`, private) is a field on the page. It is remembered in this browser, or given in the link: `https://your.site/?repo=owner/fido-box`. The repository name is not secret.
