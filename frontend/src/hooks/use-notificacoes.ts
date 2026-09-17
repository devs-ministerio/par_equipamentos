import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchNotificacoes, marcarNotificacaoLida } from '@/services/monitoramento';
import { useAuthSession } from './useAuthSession';
import { monitoramentoKeys } from './monitoramento-query-keys';

/** Badge de notificação (Radar de Convênios) -- GET /notificacoes exige
 * usuário logado (require_current_user), então só busca quando há sessão
 * (evita 401 recorrente pra visitante anônimo). Cookie HttpOnly (Bloco 2)
 * -- "há sessão?" vem de `useAuthSession` (pergunta ao backend via
 * `/auth/me`), não mais de um token lido sincronamente do localStorage.
 * Poll a cada 60s -- mesmo intervalo aceitável documentado pro job de
 * descoberta/verificação (diário), aqui é só pra refletir notificação nova
 * sem exigir F5 manual, não pra "tempo real" de verdade. */
export function useNotificacoes() {
  const queryClient = useQueryClient();
  const { autenticado } = useAuthSession();

  const query = useQuery({
    queryKey: monitoramentoKeys.notificacoes(),
    queryFn: () => fetchNotificacoes({ limit: 20 }),
    enabled: autenticado,
    refetchInterval: autenticado ? 60_000 : false,
  });

  async function marcarLida(notificacaoId: number) {
    await marcarNotificacaoLida(notificacaoId);
    queryClient.invalidateQueries({ queryKey: monitoramentoKeys.notificacoes() });
  }

  return {
    notificacoes: query.data?.itens ?? [],
    naoLidas: query.data?.nao_lidas ?? 0,
    carregando: query.isLoading,
    marcarLida,
    habilitado: autenticado,
  };
}
