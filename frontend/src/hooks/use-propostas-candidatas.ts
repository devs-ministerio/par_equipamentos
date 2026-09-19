import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchPropostasCandidatas, revisarPropostaCandidata, type PropostaCandidataStatus } from '@/services/propostas-candidatas';
import { monitoramentoKeys } from './monitoramento-query-keys';

/** Candidatos do job de descoberta TransfereGov (Radar de Convênios) --
 * leitura é pública (mesmo padrão de GET /monitoramento/instrumentos), só
 * a revisão (aceitar/rejeitar) exige sessão de editor -- ver
 * backend/app/routers/propostas_candidatas.py. */
export function usePropostasCandidatas(status?: PropostaCandidataStatus) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: monitoramentoKeys.propostasCandidatas(status),
    queryFn: () => fetchPropostasCandidatas({ status, tamanhoPagina: 500 }),
  });

  const revisarMutation = useMutation({
    mutationFn: ({ id, decisao }: { id: number; decisao: 'aceita' | 'rejeitada' }) =>
      revisarPropostaCandidata(id, decisao),
    onSuccess: () => {
      // pendente/aceita/rejeitada e a lista "sem filtro" (aba usa todas as
      // 3 chaves) -- invalida tudo em vez de tentar adivinhar qual mudou.
      queryClient.invalidateQueries({ queryKey: ['propostas-candidatas'] });
      queryClient.invalidateQueries({ queryKey: monitoramentoKeys.instrumentos });
    },
  });

  return {
    propostas: query.data?.itens ?? [],
    total: query.data?.total ?? 0,
    carregando: query.isLoading,
    erro: query.error,
    revisar: revisarMutation.mutateAsync,
    revisando: revisarMutation.isPending,
    erroRevisao: revisarMutation.error,
  };
}
