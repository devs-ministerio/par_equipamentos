import { useQuery } from '@tanstack/react-query';
import { fetchFacilities, fetchMacroCoverage } from '@/services/api';
import type { FacilityOption } from '@/services/api';
import type { CoberturaRow, Macrorregiao } from '@/types/domain';

interface RelatoriosDados {
  macros: Macrorregiao[];
  coberturaRows: CoberturaRow[];
  facilities: FacilityOption[];
}

/**
 * Dado que os modais de exportacao (PDF/Excel) da pagina de Relatorios
 * precisam pra montar os proprios filtros -- migrado de `useEffect`+
 * `setState` manual pra `useQuery` (2026-09-11). Nao herda o filtro que o
 * usuario tenha deixado aplicado no Dashboard (cada modal ja tem seu proprio
 * seletor de filtro embutido, entao da pra escolher de novo aqui sem perda
 * de funcionalidade).
 */
export function useRelatoriosDados(equipmentFamily: string) {
  const query = useQuery({
    queryKey: ['relatorios-dados', equipmentFamily],
    queryFn: async (): Promise<RelatoriosDados> => {
      const [coverage, facilityOptions] = await Promise.all([
        fetchMacroCoverage(equipmentFamily),
        fetchFacilities(equipmentFamily),
      ]);
      return { macros: coverage.macros, coberturaRows: coverage.coberturaRows, facilities: facilityOptions };
    },
  });

  return {
    macros: query.data?.macros ?? [],
    coberturaRows: query.data?.coberturaRows ?? [],
    facilities: query.data?.facilities ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
  };
}
