import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import scriptSource from '../../../public/theme-init.js?raw';
import { installMatchMedia } from '../../test/match-media';
import { DARK_SCHEME_QUERY, THEME_ATTRIBUTE, THEME_STORAGE_KEY, themeModeSchema } from './theme';

import type { MatchMediaController } from '../../test/match-media';

const BRIDGE_PROPERTY = 'pulseTestMatchMedia';

// The no-flash script is a classic script outside the bundle, so run it the way the browser does.
// jsdom runs classic scripts in its own realm (its `window` is not the test's globalThis); only the
// document is shared, so the test's matchMedia mock is handed over through it.
function runThemeInitScript() {
  Object.assign(document, { [BRIDGE_PROPERTY]: (query: string) => window.matchMedia(query) });
  const script = document.createElement('script');
  script.textContent = `window.matchMedia = document.${BRIDGE_PROPERTY};\n${scriptSource}`;
  document.head.append(script);
  script.remove();
  Reflect.deleteProperty(document, BRIDGE_PROPERTY);
}

const appliedTheme = () => document.documentElement.getAttribute(THEME_ATTRIBUTE);

let media: MatchMediaController;

beforeEach(() => {
  media = installMatchMedia({ [DARK_SCHEME_QUERY]: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
});

describe('public/theme-init.js', () => {
  it('uses the same storage key, attribute, query, and modes as the app', () => {
    expect(scriptSource).toContain(`'${THEME_STORAGE_KEY}'`);
    expect(scriptSource).toContain(`'${THEME_ATTRIBUTE}'`);
    expect(scriptSource).toContain(`'${DARK_SCHEME_QUERY}'`);
    for (const mode of themeModeSchema.options) expect(scriptSource).toContain(`'${mode}'`);
  });

  it('follows the OS preference by default', () => {
    media.set(DARK_SCHEME_QUERY, true);
    runThemeInitScript();
    expect(appliedTheme()).toBe('dark');
  });

  it('applies a stored explicit mode over the OS preference', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    media.set(DARK_SCHEME_QUERY, true);
    runThemeInitScript();
    expect(appliedTheme()).toBe('light');
  });

  it('ignores an invalid stored value', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    runThemeInitScript();
    expect(appliedTheme()).toBe('light');
  });

  it('survives localStorage throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    media.set(DARK_SCHEME_QUERY, true);
    runThemeInitScript();
    expect(appliedTheme()).toBe('dark');
  });
});
