import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/shared/theme';

import { installMatchMedia } from '../test/match-media';
import { App } from './App';

const renderApp = () =>
  render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );

beforeEach(() => {
  installMatchMedia({ '(prefers-color-scheme: dark)': false });
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('App (Foundations preview)', () => {
  it('renders the preview sections', () => {
    renderApp();

    expect(screen.getByRole('heading', { level: 1, name: 'Pulse' })).toBeInTheDocument();
    for (const name of ['Color roles', 'Typography', 'Spacing, radius, and elevation']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
    expect(screen.getByText('accent-foreground')).toBeInTheDocument();
    expect(screen.getByText('chart-6')).toBeInTheDocument();
  });

  it('switches the theme from the theme switcher', async () => {
    renderApp();
    const group = screen.getByRole('group', { name: 'Theme' });

    expect(within(group).getByRole('radio', { name: 'System' })).toBeChecked();
    await userEvent.click(within(group).getByRole('radio', { name: 'Dark' }));

    expect(within(group).getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });
});
