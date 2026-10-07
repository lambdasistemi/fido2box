// @ts-check
// Static user guidance and appearance-only preferences. No box data is read here.
const HELP_KEY = 'fido2box-inline-help';
const TOPICS = [
  { id: 'boxes', title: 'Boxes and browser storage',
    summary: 'A box is an encrypted file containing your items and the information your enrolled security keys need to unlock them.',
    details: ['This browser keeps a local copy of each box. Edits are saved here immediately; sending them to GitHub takes a separate Push.',
      'Clearing site data or losing this device can remove the local copies. Keep a downloaded copy or a backup on GitHub.',
      'Item titles, addresses, and secrets are encrypted. Box names and security-key names are not secret.'] },
  { id: 'create', title: 'Create or import a box',
    summary: 'Choose New box to start, or Import file to use an existing box. Importing a file does not unlock it.',
    details: ['For a new box, choose a name using letters, digits, hyphens, or underscores. Plug in only the security key you want to enroll and give it a recognizable name.',
      'Creation asks for the key’s PIN and a touch twice. Once the box opens, add your items and enroll a spare key.',
      'To import, select the downloaded JSON box file. Its filename becomes its name here. If that name already exists, rename the file before importing.'] },
  { id: 'items', title: 'Unlock, open, and copy items',
    summary: 'Unlock with any enrolled key, enter its PIN when asked, and touch it. Open visits an item’s address; Copy puts its secret on your clipboard.',
    details: ['An item has a name, an HTTPS web address, and a secret. The secret stays hidden in the item list.',
      'The app tries to clear a copied secret after one minute, if it is still on the clipboard. Browser permissions can prevent this; clear it yourself if the app reports a problem.',
      'Lock the box when finished. Reloading also locks your boxes. Neither action deletes the encrypted files saved in this browser.'] },
  { id: 'keys', title: 'Enroll and recognize security keys',
    summary: 'Any one enrolled key can open a box. Enroll a spare while you can still unlock it, then keep that spare somewhere safe.',
    details: ['Use the box’s Security keys tab to add a key while the box is unlocked. Plug in only the key you intend to add.',
      'Detect asks the key to answer and matches it to credentials already listed in your boxes. A key may ask for its PIN and a touch. Wrong PINs consume the key’s remaining tries.',
      'Test the plugged-in key checks compatibility without adding a box. The browser and key need WebAuthn PRF support.',
      'Removing a key does not revoke its access to older copies of the box. To revoke access, create a new box using only the keys you want to keep.'] },
  { id: 'labels', title: 'Names stored on a key',
    summary: 'Write a label on a security key so this site can read it back later. A label helps tell identical keys apart; it does not enroll the key in a box.',
    details: ['Write it on the key uses a discoverable credential slot and asks for the PIN and a touch.',
      'Who is this? reads a label back. A box’s New key form can also read the label to fill in its name.',
      'Labels are tied to this website. Resetting a key erases its stored credentials, including labels.'] },
  { id: 'sync', title: 'Back up and sync with GitHub',
    summary: 'Push saves this browser’s box to GitHub. Pull brings the GitHub version into this browser. Local edits are not pushed automatically.',
    details: ['Set one repository as owner/name in Settings, then use a box’s Sync tab to connect. Each box is saved under boxes/NAME.json.',
      'Refresh GitHub checks remote versions. In sync means the copies match; ahead or behind tells you which has the higher revision. Only here means GitHub has no copy after a successful refresh.',
      'Push refuses conflicting or newer remote versions. Pull asks again before replacing a local copy with a lower revision. After pulling into an unlocked box, lock and unlock it to read the fetched items.',
      'Download the file keeps an encrypted backup. Delete from this browser removes only the local copy; it does not remove the GitHub file.'] },
  { id: 'tokens', title: 'GitHub access tokens',
    summary: 'A GitHub token lets the app access your box repository. It is separate from your hardware key and should be limited to that repository.',
    details: ['Create a fine-grained token in GitHub with access to only the box repository and Contents: read and write. Note its expiry so you can replace it when needed.',
      'In the box’s Sync tab, Keep it in this box stores the token as an encrypted item. Unlocking that box makes it available for GitHub access.',
      'Settings also accepts a token for the current page session. That token is not saved by the app and is lost on reload.'] },
  { id: 'recovery', title: 'Recover on another device',
    summary: 'Recovery needs both a copy of your box file and a working key enrolled in it. A security key alone cannot recreate a lost box.',
    details: ['On the replacement device, visit the same website address used when enrolling the key. Credentials made on localhost or another domain will not work here.',
      'Retrieve the box from a downloaded backup, or sign in to GitHub and download its JSON file from the boxes folder. You must be able to access that backup independently.',
      'Choose Import file, open the imported box, and Unlock with an enrolled key. Then Open the service and Copy the secret you need.',
      'Rehearse recovery before you need it. Keep an enrolled spare key and a separate box backup. If all enrolled keys are lost or reset, the app cannot unlock the box.'] }
];

let enabled = true;
try { enabled = localStorage.getItem(HELP_KEY) !== 'off'; } catch {}
/** @type {HTMLDialogElement | null} */
let dialog = null;
/** @returns {boolean} */
export const inlineHelpEnabled = () => enabled;

export function closeHelp() { if (dialog?.open) dialog.close(); }

function updateControls() {
  document.querySelectorAll('button[data-help]').forEach((button) => { if (button instanceof HTMLElement) button.hidden = !enabled; });
  if (!enabled) closeHelp();
}

/** Set the preference without re-rendering forms. Returns whether it was saved. @param {boolean} value */
export function setInlineHelp(value) {
  enabled = value;
  updateControls();
  try { localStorage.setItem(HELP_KEY, value ? 'on' : 'off'); return true; } catch { return false; }
}

/** @param {string} tag @param {string} text @param {string} [className] */
function textElement(tag, text, className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}

/** @param {typeof TOPICS[number]} topic */
function openHelp(topic) {
  if (!enabled) return;
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'inlineHelpDialog';
    dialog.className = 'help-dialog';
    dialog.setAttribute('aria-labelledby', 'inlineHelpTitle');
    dialog.setAttribute('aria-describedby', 'inlineHelpSummary');
    // Native dialogs can send Tab to browser chrome at the boundary; keep this
    // short help flow cycling between its Close button and documentation link.
    dialog.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab' || !dialog) return;
      const controls = dialog.querySelectorAll('button, a[href]');
      const first = controls[0], last = controls[controls.length - 1];
      const target = event.shiftKey && document.activeElement === first ? last : !event.shiftKey && document.activeElement === last ? first : null;
      if (target instanceof HTMLElement) { event.preventDefault(); target.focus(); }
    });
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog || !dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeHelp();
    });
    document.body.append(dialog);
  }
  const heading = textElement('h2', topic.title);
  heading.id = 'inlineHelpTitle';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.autofocus = true;
  close.addEventListener('click', closeHelp);
  const header = textElement('div', '', 'row sp');
  header.append(heading, close);
  const summary = textElement('p', topic.summary);
  summary.id = 'inlineHelpSummary';
  const link = textElement('a', 'Read the full guide →');
  link.setAttribute('href', '#/docs/' + topic.id);
  link.addEventListener('click', closeHelp);
  dialog.replaceChildren(header, summary, link);
  dialog.showModal();
}

/** @param {string} id */
export function helpButton(id) {
  const topic = TOPICS.find((entry) => entry.id === id);
  if (!topic) throw new Error('Unknown help topic: ' + id);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'help-button';
  button.dataset.help = id;
  button.hidden = !enabled;
  button.textContent = '?';
  button.setAttribute('aria-label', 'Help: ' + topic.title);
  button.setAttribute('aria-haspopup', 'dialog');
  button.addEventListener('click', () => openHelp(topic));
  return button;
}

export function documentationView() {
  const view = textElement('div', '', 'documentation');
  view.append(textElement('h1', 'Documentation'), textElement('p', 'A practical guide to your boxes, security keys, and backups.', 'muted'));
  const handbook = textElement('a', 'Project documentation: recovery, security, and development →');
  handbook.setAttribute('href', '/docs/');
  const handbookNote = textElement('p', '');
  handbookNote.append(handbook);
  view.append(handbookNote);
  const contents = textElement('nav', '', 'docs-contents card');
  contents.setAttribute('aria-label', 'Documentation topics');
  TOPICS.forEach((topic) => {
    const link = textElement('a', topic.title);
    link.setAttribute('href', '#/docs/' + topic.id);
    contents.append(link);
  });
  view.append(contents);
  TOPICS.forEach((topic) => {
    const section = textElement('section', '', 'card docs-section');
    const heading = textElement('h2', topic.title);
    heading.id = 'docs-' + topic.id;
    heading.tabIndex = -1;
    section.setAttribute('aria-labelledby', heading.id);
    const list = textElement('ul', '');
    topic.details.forEach((detail) => list.append(textElement('li', detail)));
    section.append(heading, textElement('p', topic.summary), list);
    view.append(section);
  });
  const note = textElement('p', 'Use Settings to enable or disable the inline “?” buttons. Documentation is always available.', 'muted small');
  view.append(note);
  return view;
}
