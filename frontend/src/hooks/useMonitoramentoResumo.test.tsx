import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMonitoramentoResumo } from './useMonitoramentoResumo';
import { ApiError } from '@/lib/api-error';
import type { ResumoMonitoramento } from '@/services/monitoramento-resumo';

// Fronteira externa (fetch) mockada -- o que está sob teste é o hook
// (queryKey, propagação de sucesso/erro do TanStack Query), não o service.
vi.mock('@/services/monitoramento-resumo', () => ({
  fetchResumoMonitoramento: vi.fn(),
}));

const RESUMO_EXEMPLO: ResumoMonitoramento = {
  total_instrumentos: 86,
  pct_execucao_fisica_medio: 0.77,
  distribuicao_fase: [],
  licencas_cnen_deferidas: 12,
  licencas_vencendo: [],
  por_tecnico_titular: [],
  inauguracoes: [],
  acoes_pendentes: 0,
  acoes_atrasadas: 0,
  nr_convenios: [],
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useMonitoramentoResumo', () => {
  it('devolve o resumo em caso de sucesso', async () => {
    const { fetchResumoMonitoramento } = await import('@/services/monitoramento-resumo');
    vi.mocked(fetchResumoMonitoramento).mockResolvedValue(RESUMO_EXEMPLO);

    const { result } = renderHook(() => useMonitoramentoResumo(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(RESUMO_EXEMPLO);
  });

  it('propaga o erro (ApiError) em caso de falha', async () => {
    const { fetchResumoMonitoramento } = await import('@/services/monitoramento-resumo');
    vi.mocked(fetchResumoMonitoramento).mockRejectedValue(new ApiError('Falha de rede', undefined, 'Não foi possível completar a operação.'));

    const { result } = renderHook(() => useMonitoramentoResumo(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
  });
});
