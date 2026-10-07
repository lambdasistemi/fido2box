// Apply appearance before the stylesheet loads, including when storage is blocked.
(() => {
  const storageKey = 'fido2box-theme';
  const valid = (/** @type {string | null} */ value) => value === 'light' || value === 'dark' || value === 'system';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let choice = 'system';
  try { const saved = localStorage.getItem(storageKey); if (saved && valid(saved)) choice = saved; } catch {}

  function apply() {
    document.documentElement.dataset.theme = choice === 'system' ? (system.matches ? 'dark' : 'light') : choice;
    document.querySelectorAll('[data-theme-choice]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-theme-choice') === choice));
    });
  }
  apply();
  system.addEventListener('change', apply);
  window.addEventListener('storage', (event) => {
    if (event.key === storageKey) { choice = valid(event.newValue) ? event.newValue || 'system' : 'system'; apply(); }
  });
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-theme-choice]').forEach((button) => {
      button.addEventListener('click', () => {
        const next = button.getAttribute('data-theme-choice');
        if (!next || !valid(next)) return;
        choice = next;
        try { localStorage.setItem(storageKey, choice); } catch {}
        apply();
      });
    });
    apply();
  });
})();
