// @ts-check
// Which addresses the app will ever open: https only (http only for rehearsal on this computer).

/** @param {string} u @returns {string} the normalised address, or '' when it must not be opened */
export function safeUrl(u) {
  try {
    const x = new URL(u);
    return (x.protocol === 'https:' || (x.protocol === 'http:' && (x.hostname === 'localhost' || x.hostname === '127.0.0.1'))) ? x.href : '';
  } catch (e) { return ''; }
}
