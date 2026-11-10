import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { messages } from '@/shared/i18n';

import { App } from './App';
import { AppProviders } from './providers';
import { createFakeSession } from './testing/session-fakes';

const fake = createFakeSession();

afterEach(() => {
  fake.controller.dispose();
});

describe('App', () => {
  it('renders the header with the data source and the simulated-data label', () => {
    render(
      <AppProviders controller={fake.controller}>
        <App />
      </AppProviders>,
    );
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByText(messages.simulatedData.badge)).toBeInTheDocument();
  });
});
