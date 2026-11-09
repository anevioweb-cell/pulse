import { useQueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AppProviders } from './providers';

function ClientProbe() {
  const client = useQueryClient();
  return <p>{client.getDefaultOptions().mutations?.retry === false ? 'configured' : 'default'}</p>;
}

describe('AppProviders', () => {
  it('provides the configured QueryClient to its children', () => {
    render(
      <AppProviders>
        <ClientProbe />
      </AppProviders>,
    );
    expect(screen.getByText('configured')).toBeInTheDocument();
  });
});
