import { useQuery } from "@tanstack/react-query";
import { fetchPropostasCandidatas } from "@/services/propostas-candidatas";
import { monitoramentoKeys } from "./monitoramento-query-keys";

/** Candidatos descobertos no TransfereGov; a entrada no monitoramento é
 * explícita e usa o mesmo POST dos demais instrumentos. */
export function usePropostasCandidatas() {
  const query = useQuery({
    queryKey: monitoramentoKeys.propostasCandidatas(),
    queryFn: () => fetchPropostasCandidatas({ tamanhoPagina: 500 }),
  });

  return {
    propostas: query.data?.itens ?? [],
    total: query.data?.total ?? 0,
    carregando: query.isLoading,
    erro: query.error,
  };
}
