// Applies the saved theme before first paint to avoid a flash of the wrong theme.
// Loaded as a blocking external script (not inline) so a strict CSP (script-src 'self') allows it.
// Keep the key, attribute, and values in sync with src/shared/theme/theme.ts (see theme-init.test.ts).
(function () {
  'use strict';
  var mode = 'system';
  try {
    var stored = window.localStorage.getItem('pulse.theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system') mode = stored;
  } catch {
    // Storage unavailable: fall back to the system preference.
  }
  var dark =
    mode === 'dark' ||
    (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
