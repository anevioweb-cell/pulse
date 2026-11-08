import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installMatchMedia } from '../../test/match-media';
import { DARK_SCHEME_QUERY, THEME_ATTRIBUTE, THEME_STORAGE_KEY } from './theme';
import { ThemeProvider } from './ThemeProvider';
import { useTheme } from './useTheme';

import type { MatchMediaController } from '../../test/match-media';
import type { ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
);
const appliedTheme = () => document.documentElement.getAttribute(THEME_ATTRIBUTE);

function ThemeProbe() {
  const { mode, resolvedTheme, setMode } = useTheme();
  return (
    <div>
      <p>
        {mode}/{resolvedTheme}
      </p>
      <button
        type="button"
        onClick={() => {
          setMode('dark');
        }}
      >
        Dark
      </button>
    </div>
  );
}

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

describe('ThemeProvider', () => {
  it('defaults to system mode and follows the OS preference', () => {
    media.set(DARK_SCHEME_QUERY, true);
    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.mode).toBe('system');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(appliedTheme()).toBe('dark');
  });

  it('reacts to prefers-color-scheme changes while in system mode', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(appliedTheme()).toBe('light');

    act(() => {
      media.set(DARK_SCHEME_QUERY, true);
    });

    expect(result.current.resolvedTheme).toBe('dark');
    expect(appliedTheme()).toBe('dark');
  });

  it('ignores OS changes once an explicit mode is chosen, and persists the choice', async () => {
    render(<ThemeProbe />, { wrapper });

    await userEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(screen.getByText('dark/dark')).toBeInTheDocument();
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    act(() => {
      media.set(DARK_SCHEME_QUERY, false);
    });
    expect(appliedTheme()).toBe('dark');
  });

  it('restores a valid stored mode', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    media.set(DARK_SCHEME_QUERY, true);
    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.mode).toBe('light');
    expect(appliedTheme()).toBe('light');
  });

  it('rejects an invalid stored value and falls back to system', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, '<script>alert(1)</script>');
    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.mode).toBe('system');
  });

  it('keeps working when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.mode).toBe('system');

    act(() => {
      result.current.setMode('dark');
    });
    expect(result.current.mode).toBe('dark');
    expect(appliedTheme()).toBe('dark');
  });

  it('stops listening to the OS preference on unmount', () => {
    const { unmount } = renderHook(() => useTheme(), { wrapper });
    unmount();

    expect(() => {
      media.set(DARK_SCHEME_QUERY, true);
    }).not.toThrow();
    expect(appliedTheme()).toBe('light');
  });
});

describe('useTheme', () => {
  it('throws outside ThemeProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useTheme())).toThrow(/inside <ThemeProvider>/);
  });
});
