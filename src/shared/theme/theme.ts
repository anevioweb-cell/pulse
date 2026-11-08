import { z } from 'zod/mini';

// Keep in sync with public/theme-init.js (guarded by theme-init.test.ts).
export const THEME_STORAGE_KEY = 'pulse.theme';
export const THEME_ATTRIBUTE = 'data-theme';
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

export const themeModeSchema = z.enum(['system', 'light', 'dark']);
export type ThemeMode = z.infer<typeof themeModeSchema>;
export type ResolvedTheme = Exclude<ThemeMode, 'system'>;

export const DEFAULT_THEME_MODE: ThemeMode = 'system';

/** Reads the persisted mode. Storage may be unavailable (privacy mode) or contain anything. */
export function readStoredThemeMode(): ThemeMode {
  try {
    const parsed = themeModeSchema.safeParse(window.localStorage.getItem(THEME_STORAGE_KEY));
    return parsed.success ? parsed.data : DEFAULT_THEME_MODE;
  } catch {
    return DEFAULT_THEME_MODE;
  }
}

export function writeStoredThemeMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Storage is unavailable or full; the choice still applies for this session.
  }
}

export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode !== 'system') return mode;
  return systemPrefersDark ? 'dark' : 'light';
}

export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
}
