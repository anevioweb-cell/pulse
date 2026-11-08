import { useId } from 'react';

import { cn } from '@/shared/lib';
import { useTheme } from '@/shared/theme';
import type { ThemeMode } from '@/shared/theme';

const OPTIONS: readonly { mode: ThemeMode; label: string }[] = [
  { mode: 'system', label: 'System' },
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
];

export function ThemeSwitcher() {
  const { mode, resolvedTheme, setMode } = useTheme();
  const name = useId();

  return (
    <fieldset className="flex flex-wrap items-center gap-3">
      <legend className="sr-only">Theme</legend>
      <div className="inline-flex rounded-lg border border-border-strong bg-surface-sunken p-1">
        {OPTIONS.map((option) => (
          <label
            key={option.mode}
            className={cn(
              'cursor-pointer rounded-md px-3 py-1 text-sm transition-colors duration-fast',
              'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus-ring',
              mode === option.mode
                ? 'bg-accent text-accent-foreground'
                : 'text-text-muted hover:text-text',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.mode}
              checked={mode === option.mode}
              onChange={() => {
                setMode(option.mode);
              }}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
      <p className="text-sm text-text-muted" aria-live="polite">
        Applied: <span className="font-medium text-text">{resolvedTheme}</span>
      </p>
    </fieldset>
  );
}
