import { Monitor, Moon, Sun } from 'lucide-react';

import { messages } from '@/shared/i18n';
import { useTheme } from '@/shared/theme';
import type { ThemeMode } from '@/shared/theme';
import { IconButton } from '@/shared/ui';

const nextMode = (mode: ThemeMode): ThemeMode => {
  switch (mode) {
    case 'system':
      return 'light';
    case 'light':
      return 'dark';
    default:
      return 'system';
  }
};

const nameOf = (mode: ThemeMode) => {
  switch (mode) {
    case 'light':
      return messages.theme.light;
    case 'dark':
      return messages.theme.dark;
    default:
      return messages.theme.system;
  }
};

/** Cycles System → Light → Dark through the existing ThemeProvider; the label names the current mode. */
export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const Icon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor;
  return (
    <IconButton
      label={messages.theme.toggle(nameOf(mode))}
      onClick={() => {
        setMode(nextMode(mode));
      }}
    >
      <Icon aria-hidden="true" />
    </IconButton>
  );
}
