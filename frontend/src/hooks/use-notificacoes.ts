import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { mensagemSeguraDoErro } from "@/lib/api-error";
import {
  fetchNotificacoes,
  marcarNotificacaoLida,
  arquivarNotificacao,
  marcarTodasNotificacoesLidas,
  type FiltrosNotificacoes,
} from "@/services/notificacoes";
import { useAuthSession } from "./useAuthSession";
import { monitoramentoKeys } from "./monitoramento-query-keys";

/** Badge de notificação (Radar de Convênios) -- GET /notificacoes exige
 * usuário logado (require_current_user), então só busca quando há sessão
 * (evita 401 recorrente pra visitante anônimo). Cookie HttpOnly (Bloco 2)
 * -- "há sessão?" vem de `useAuthSession` (pergunta ao backend via
 * `/auth/me`), não mais de um token lido sincronamente do localStorage.
 * Poll a cada 60s -- mesmo intervalo aceitável documentado pro job de
 * descoberta/verificação (diário), aqui é só pra refletir notificação nova
 * sem exigir F5 manual, não pra "tempo real" de verdade. */
export function useNotificacoes(filtros: FiltrosNotificacoes = { limit: 20 }) {
  const queryClient = useQueryClient();
  const { autenticado, usuarioAtual } = useAuthSession();

  const query = useQuery({
    queryKey: [
      ...monitoramentoKeys.notificacoesBase,
      usuarioAtual?.id,
      filtros,
    ],
    queryFn: () => fetchNotificacoes(filtros),
    enabled: autenticado,
    staleTime: 15_000,
    retry: 1,
    refetchInterval: autenticado ? 60_000 : false,
  });

  const invalidar = () =>
    queryClient.invalidateQueries({
      queryKey: monitoramentoKeys.notificacoesBase,
    });
  const falhou = (erro: unknown) => toast.error(mensagemSeguraDoErro(erro));
  const leitura = useMutation({
    mutationFn: marcarNotificacaoLida,
    onSuccess: invalidar,
    onError: falhou,
  });
  const arquivo = useMutation({
    mutationFn: ({ id, arquivada }: { id: number; arquivada: boolean }) =>
      arquivarNotificacao(id, arquivada),
    onSuccess: async (_resultado, pedido) => {
      toast.success(
        pedido.arquivada ? "Notificação arquivada." : "Notificação restaurada.",
      );
      await invalidar();
    },
    onError: falhou,
  });
  const todas = useMutation({
    mutationFn: marcarTodasNotificacoesLidas,
    onSuccess: async () => {
      toast.success("Notificações marcadas como lidas.");
      await invalidar();
    },
    onError: falhou,
  });

  return {
    notificacoes: query.data?.itens ?? [],
    naoLidas: query.data?.nao_lidas ?? 0,
    carregando: query.isLoading,
    total: query.data?.total ?? 0,
    erro: query.error,
    tentarNovamente: query.refetch,
    marcarLida: leitura.mutateAsync,
    arquivar: arquivo.mutateAsync,
    marcarTodas: todas.mutateAsync,
    ocupada: leitura.isPending || arquivo.isPending || todas.isPending,
    habilitado: autenticado,
  };
}
