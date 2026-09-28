import { useQuery } from "@tanstack/react-query";
import { fetchAuditoria, type FiltroAuditoria } from "@/services/auditoria";
import { monitoramentoKeys } from "./monitoramento-query-keys";

export function useAuditoria(filtro: FiltroAuditoria) {
  const query = useQuery({
    queryKey: monitoramentoKeys.auditoria(filtro),
    queryFn: () => fetchAuditoria(filtro),
  });

  return {
    itens: query.data?.itens ?? [],
    total: query.data?.total ?? 0,
    carregando: query.isLoading,
    erro: query.error,
    refetch: query.refetch,
  };
}
