import { createContext } from 'react';

import type { ResolvedTheme, ThemeMode } from './theme';

export interface ThemeContextValue {
  /** The user's choice, including "system". */
  mode: ThemeMode;
  /** The theme actually applied to the document. */
  resolvedTheme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
