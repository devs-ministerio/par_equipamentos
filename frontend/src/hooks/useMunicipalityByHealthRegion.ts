import { useQuery } from '@tanstack/react-query';
import { fetchMunicipalityCoverage } from '@/services/api';
import type { NivelCoberturaRow } from '@/types/domain';

type Dados = NivelCoberturaRow[] | 'carregando' | 'erro';

/**
 * Municípios de UMA região de saúde -- busca sob demanda, só quando a região
 * é expandida pela primeira vez (`enabled`). queryKey inclui
 * `healthRegionCode`: expandir uma região diferente é uma query nova e
 * independente.
 */
export function useMunicipalityByHealthRegion(equipmentFamily: string, healthRegionCode: string, enabled: boolean) {
  const query = useQuery({
    queryKey: ['municipality-coverage-by-health-region', equipmentFamily, healthRegionCode],
    queryFn: () => fetchMunicipalityCoverage({ equipmentFamily, healthRegionCodes: [healthRegionCode] }),
    enabled,
  });

  const dados: Dados = query.isLoading ? 'carregando' : query.isError ? 'erro' : (query.data ?? []);
  return { dados };
}
