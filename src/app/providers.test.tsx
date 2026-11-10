import { useQueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useTelemetryApi } from '@/features/telemetry';

import { AppProviders } from './providers';
import { createFakeSession } from './testing/session-fakes';

function ClientProbe() {
  const client = useQueryClient();
  const api = useTelemetryApi();
  const retry = client.getDefaultOptions().mutations?.retry === false ? 'configured' : 'default';
  return <p>{`${retry} ${api.mode}`}</p>;
}

const fake = createFakeSession();

afterEach(() => {
  fake.controller.dispose();
});

describe('AppProviders', () => {
  it("provides the active session's QueryClient and TelemetryApi to its children", () => {
    render(
      <AppProviders controller={fake.controller}>
        <ClientProbe />
      </AppProviders>,
    );
    expect(screen.getByText('configured demo')).toBeInTheDocument();
  });
});
