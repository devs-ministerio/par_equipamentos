import { useQuery } from "@tanstack/react-query";
import { fetchInstrumentos } from "@/services/monitoramento-instrumentos";
import { monitoramentoKeys } from "./monitoramento-query-keys";

/** GET /monitoramento/instrumentos completo -- usado pelas páginas de
 * overview/painel (tabela, filtros, rankings). Compartilha cache
 * (`monitoramentoKeys.instrumentos`) com `useInstrumentosMonitorados`
 * abaixo, então abrir qualquer uma das duas telas já esquenta a outra. */
export function useMonitoramentoInstrumentos() {
  return useQuery({
    queryKey: monitoramentoKeys.instrumentos,
    queryFn: fetchInstrumentos,
  });
}
