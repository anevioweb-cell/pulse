import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { messages } from '@/shared/i18n';
import { ThemeProvider } from '@/shared/theme';

import { installMatchMedia } from '../test/match-media';
import { App } from './App';
import { AppProviders } from './providers';
import { createFakeSession } from './testing/session-fakes';

const fake = createFakeSession();

afterEach(() => {
  fake.controller.dispose();
});

describe('App', () => {
  it('renders the browser router with the shell and the overview at /', async () => {
    installMatchMedia();
    render(
      <ThemeProvider>
        <AppProviders controller={fake.controller}>
          <App />
        </AppProviders>
      </ThemeProvider>,
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: messages.pages.overview.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByText(messages.simulatedData.badge)).toBeInTheDocument();
  });
});
