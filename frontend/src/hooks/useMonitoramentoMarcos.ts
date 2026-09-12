import { useQuery } from '@tanstack/react-query';
import { fetchMarcos } from '@/services/monitoramento';
import { monitoramentoKeys } from './monitoramento-query-keys';

/** Catálogo fixo de marcos (fase geral / cronograma físico / regulatório)
 * -- praticamente estático, `staleTime` bem maior que o default global
 * (30s) porque não muda em uso normal. */
export function useMonitoramentoMarcos() {
  return useQuery({
    queryKey: monitoramentoKeys.marcos,
    queryFn: fetchMarcos,
    staleTime: 5 * 60_000,
  });
}
