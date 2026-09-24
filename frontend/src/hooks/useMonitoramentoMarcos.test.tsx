import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMonitoramentoMarcos } from './useMonitoramentoMarcos';

vi.mock('@/services/monitoramento-marcos', () => ({ fetchMarcos: vi.fn() }));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useMonitoramentoMarcos', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mantém o catálogo por cinco minutos antes de revalidar', async () => {
    const { fetchMarcos } = await import('@/services/monitoramento-marcos');
    vi.mocked(fetchMarcos).mockResolvedValueOnce([]);
    const { result } = renderHook(() => useMonitoramentoMarcos(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(result.current.dataUpdatedAt).toBeGreaterThan(0);
  });
});
