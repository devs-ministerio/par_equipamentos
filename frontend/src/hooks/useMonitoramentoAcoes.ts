import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CriarAcaoInput,
  type EditarAcaoInput,
  concluirAcao,
  criarAcao,
  editarAcao,
  excluirAcao,
  fetchAcoes,
} from "@/services/monitoramento-acoes";
import { monitoramentoKeys } from "./monitoramento-query-keys";

/** Todas as ações (ou só pendentes, `pendentes=true`) de todos os
 * instrumentos -- ver docstring de GET /monitoramento/acoes no backend. */
export function useMonitoramentoAcoes(pendentes?: boolean) {
  return useQuery({
    queryKey: monitoramentoKeys.acoes(pendentes),
    queryFn: () => fetchAcoes(pendentes),
  });
}

/** Ações de UM instrumento -- filtra client-side a partir da lista
 * completa (mesmo padrão já usado antes, GET /monitoramento/acoes não
 * aceita filtro por convênio). Reaproveita o cache de `useMonitoramentoAcoes()`
 * (chave igual, sem `pendentes`). */
export function useAcoesDoInstrumento(nrConvenio: string) {
  const query = useMonitoramentoAcoes();
  return {
    ...query,
    data: query.data?.filter((a) => a.nr_convenio === nrConvenio),
  };
}

function invalidarAcoes(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["monitoramento", "acoes"] });
  queryClient.invalidateQueries({ queryKey: monitoramentoKeys.resumo });
}

export function useCriarAcao(nrConvenio: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (corpo: CriarAcaoInput) => criarAcao(nrConvenio, corpo),
    onSuccess: () => invalidarAcoes(queryClient),
  });
}

export function useConcluirAcao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (acaoId: number) => concluirAcao(acaoId),
    onSuccess: () => invalidarAcoes(queryClient),
  });
}

/** Corrigir uma ação (append-only, Plan Mode monitoramento-evolucao
 * 2026-09-19) -- lança uma ação nova e fecha a antiga. */
export function useEditarAcao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      acaoId,
      corpo,
    }: {
      acaoId: number;
      corpo: EditarAcaoInput;
    }) => editarAcao(acaoId, corpo),
    onSuccess: () => invalidarAcoes(queryClient),
  });
}

export function useExcluirAcao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ acaoId, motivo }: { acaoId: number; motivo: string }) =>
      excluirAcao(acaoId, motivo),
    onSuccess: () => invalidarAcoes(queryClient),
  });
}
