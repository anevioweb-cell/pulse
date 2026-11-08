import { use } from 'react';

import { ThemeContext } from './ThemeContext';

import type { ThemeContextValue } from './ThemeContext';

export function useTheme(): ThemeContextValue {
  const context = use(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>');
  return context;
}
