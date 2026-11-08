import { useCallback, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';

import {
  applyTheme,
  DARK_SCHEME_QUERY,
  readStoredThemeMode,
  resolveTheme,
  writeStoredThemeMode,
} from './theme';
import { ThemeContext } from './ThemeContext';

import type { ThemeMode } from './theme';
import type { ThemeContextValue } from './ThemeContext';
import type { ReactNode } from 'react';

function subscribeToSystemScheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_SCHEME_QUERY);
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
}

const getSystemPrefersDark = () => window.matchMedia(DARK_SCHEME_QUERY).matches;

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredThemeMode);
  const systemPrefersDark = useSyncExternalStore(subscribeToSystemScheme, getSystemPrefersDark);
  const resolvedTheme = resolveTheme(mode, systemPrefersDark);

  // Layout effect so the attribute changes before paint (the no-flash script handles first load).
  useLayoutEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    writeStoredThemeMode(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolvedTheme, setMode }),
    [mode, resolvedTheme, setMode],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
