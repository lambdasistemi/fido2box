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
2. Open `setup.html`, **add items**, **add a key** (PIN and touch, twice), **download `box.json`** and publish it next to the pages.
3. From then on `index.html` is the button you give to someone.
4. `?lang=it` shows Italian.

Add more keys later: open `setup.html`, unlock with a key already in the box, add the new one, publish the new file.

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
