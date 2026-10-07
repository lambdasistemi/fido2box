// @ts-check
// Static user guidance and appearance-only preferences. No box data is read here.
const HELP_KEY = 'fido2box-inline-help';
const TOPICS = [
  { id: 'boxes', title: 'Boxes and browser storage',
    summary: 'A box is an encrypted file containing your items and the information your enrolled security keys need to unlock them.',
    details: ['This browser keeps a local copy of each box. Edits are saved here immediately; sending them to GitHub takes a separate Push.',
      'Clearing site data or losing this device can remove the local copies. Keep a downloaded copy or a backup on GitHub.',
      'Record titles, field names, kinds, hiding choices and values are encrypted. Box names and security-key names are not secret.'] },
  { id: 'create', title: 'Create or import a box',
    summary: 'Choose New box to start, or Import file to use an existing box. Importing a file does not unlock it.',
    details: ['For a new box, choose a name using letters, digits, hyphens, or underscores. Plug in only the security key you want to enroll. Choose Identify my key to reuse a name from an available box, even if that box is locked.',
      'For an unregistered key, a nickname is optional; it helps you tell keys apart and is not a password. Creation asks for the key’s PIN and a touch twice; a recognized credential needs one confirmation. Once the box opens, add your items and enroll a spare key.',
      'To import, select the downloaded JSON box file. Its filename becomes its name here. If that name already exists, rename the file before importing.'] },
  { id: 'items', title: 'Create, edit, and use recovery records',
    summary: 'Unlock with an enrolled key, then choose New record. A title and zero or more named fields keep your recovery information together. No address or password is required.',
    details: ['Add Account, Password or recovery key, Website, Backup codes, Notes, or a custom field. Custom fields start hidden. Text, multiline and URL kinds are independent of hiding; duplicate names and empty values are allowed.',
      'Every value has Copy. Permitted HTTPS or loopback HTTP addresses are links; other addresses remain savable, copyable text. Reveal and Hide are temporary for each hidden field.',
      'Edit keeps existing secrets out of controls until Reveal or Replace. Replace starts empty. Optional confirmation starts off, begins empty when enabled, compares exact spaces and line breaks, and is never saved.',
      'Remove field offers Undo. Cancel preserves the saved record; navigation asks before discarding a draft. Lock discards immediately. Untouched line endings remain exact; deliberately editing CR/CRLF text uses browser LF line endings and shows a warning.',
      'The app tries to clear a copied secret after one minute, if it is still on the clipboard. Browser permissions can prevent this; clear it yourself if the app reports a problem.',
      'Lock the box when finished. Reloading also locks your boxes. Neither action deletes the encrypted files saved in this browser.'] },
  { id: 'keys', title: 'Enroll and recognize security keys',
    summary: 'Any one enrolled key can open a box. Enroll a spare while you can still unlock it, then keep that spare somewhere safe.',
    details: ['Use the box’s Security keys tab to add a key while the box is unlocked. Plug in only the key you intend to add.',
      'Identify my key or Detect matches the key to credentials in local boxes and loaded GitHub boxes without unlocking them. Import a backup first if its keys are not available here. A cancelled or unmatched request does not prove that the key is new. A key may ask for its PIN and a touch. Wrong PINs consume the key’s remaining tries.',
      'Test the plugged-in key checks compatibility without adding a box. The browser and key need WebAuthn PRF support.',
      'Removing a key does not revoke its access to older copies of the box. To revoke access, create a new box using only the keys you want to keep.'] },
  { id: 'labels', title: 'Names stored on a key',
    summary: 'Write a label on a security key so this site can read it back later. A label is separate from the nickname in a box. It does not enroll a key, rename existing entries, or prove which box key it is.',
    details: ['Write it on the key uses a discoverable credential slot and asks for the PIN and a touch.',
      'Who is this? reads a label back. A box’s New key form can also read the label to fill in its name.',
      'Labels are tied to this website. Resetting a key erases its stored credentials, including labels.'] },
  { id: 'sync', title: 'Back up and sync with GitHub',
    summary: 'Push saves this browser’s box to GitHub. Pull brings the GitHub version into this browser. Local edits are not pushed automatically.',
    details: ['Choose Connect with security key on Boxes. Use Set up key once to store the repository and token encrypted on a supported key. Each box is saved under boxes/NAME.json.',
      'Refresh GitHub checks remote versions. In sync means the copies match; ahead or behind tells you which has the higher revision. Only here means GitHub has no copy after a successful refresh.',
      'Push refuses conflicting or newer remote versions. Pull asks again before replacing a local copy with a lower revision. Pull clears the old unlocked session immediately. Unlock the fetched box before editing; stale saves are refused.',
      'Download the file keeps the exact encrypted source. The first legacy edit asks permission to migrate to v3 and retains a verified encrypted original first. Older releases cannot safely edit v3. Retained backups stay downloadable in Boxes and Sync after active-box deletion; download a separate copy against browser-data loss.'] },
  { id: 'tokens', title: 'GitHub access tokens',
    summary: 'A GitHub token lets the app access your box repository. Store it encrypted on your security key so recovery does not depend on opening a box first.',
    details: ['Create a fine-grained token in GitHub with access to only the box repository and Contents: read and write. Note its expiry so you can replace it when needed.',
      'Choose Set up key on Boxes, enter the repository and token, then follow the PIN and touch prompts. Setup checks GitHub and verifies the key write by reading it back. This requires discoverable credentials, PRF and largeBlob support in both the key and browser. Connect with the key and use Renew access when the token expires.',
      'Settings also accepts a token for the current page session. That token is not saved by the app and is lost on reload.'] },
  { id: 'recovery', title: 'Recover on another device',
    summary: 'Recovery needs both a copy of your box file and a working key enrolled in it. A security key alone cannot recreate a lost box.',
    details: ['On the replacement device, visit the same website address used when enrolling the key. Credentials made on localhost or another domain will not work here.',
      'Choose Connect with security key. A previously configured key supplies GitHub access with no local boxes or browser settings. Pull a listed box from its Sync tab. If the key was never configured or its token has expired, set up access with a new GitHub token. You can also import a downloaded backup.',
      'Choose Import file, open the imported box, and Unlock with an enrolled key. Then follow a permitted URL value and Copy whichever field you need.',
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
