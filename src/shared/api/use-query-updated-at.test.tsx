import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createQueryClient } from './query-client';
import { useQueryUpdatedAt } from './use-query-updated-at';

import type { ReactNode } from 'react';

describe('useQueryUpdatedAt', () => {
  it('reports dataUpdatedAt and follows cache updates', () => {
    const client = createQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useQueryUpdatedAt(['thing']), { wrapper });
    expect(result.current).toBeNull();
    act(() => {
      client.setQueryData(['thing'], 1, { updatedAt: 1234 });
    });
    expect(result.current).toBe(1234);
    act(() => {
      client.setQueryData(['thing'], 2, { updatedAt: 5678 });
    });
    expect(result.current).toBe(5678);
    client.clear();
  });
});
