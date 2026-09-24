import { useQuery } from "@tanstack/react-query";
import { fetchResumoMonitoramento } from "@/services/monitoramento-resumo";
import { monitoramentoKeys } from "./monitoramento-query-keys";

/** KPIs/distribuições agregadas -- alimenta tanto o Overview quanto o
 * Painel de Gestão (mesma chamada, mesmo cache). */
export function useMonitoramentoResumo() {
  return useQuery({
    queryKey: monitoramentoKeys.resumo,
    queryFn: fetchResumoMonitoramento,
  });
}
