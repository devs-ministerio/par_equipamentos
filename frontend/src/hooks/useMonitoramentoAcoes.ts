import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CriarAcaoInput,
  type EditarAcaoInput,
  concluirAcao,
  criarAcao,
  editarAcao,
  excluirAcao,
  fetchAcoes,
  fetchAcoesDoInstrumento,
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

/** Ações de UM instrumento, lidas por instrumento no backend (não dependem do teto da carteira).
 * `total` pode superar `data.length` quando o teto da resposta é atingido. A chave começa por
 * `["monitoramento","acoes"]`, então as mutações já a invalidam. */
export function useAcoesDoInstrumento(
  nrConvenio: string,
  { enabled = true, pendentes = false } = {},
) {
  const query = useQuery({
    queryKey: monitoramentoKeys.acoesDoInstrumento(nrConvenio, pendentes),
    queryFn: () => fetchAcoesDoInstrumento(nrConvenio, pendentes),
    enabled,
  });
  return {
    ...query,
    data: query.data?.data,
    total: query.data?.meta.total,
    abertas: query.data?.meta.abertas,
    atrasadas: query.data?.meta.atrasadas,
  };
}

function invalidarAcoes(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["monitoramento", "acoes"] });
  queryClient.invalidateQueries({ queryKey: monitoramentoKeys.resumo });
  queryClient.invalidateQueries({ queryKey: monitoramentoKeys.conclusao });
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
