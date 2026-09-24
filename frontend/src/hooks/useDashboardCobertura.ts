import { useQuery } from "@tanstack/react-query";
import { fetchFacilities, fetchMacroCoverage } from "@/services/api";
import type { FacilityOption } from "@/services/api";
import type { CoberturaRow, Macrorregiao } from "@/types/domain";

interface DashboardCoberturaData {
  macros: Macrorregiao[];
  coberturaRows: CoberturaRow[];
  facilities: FacilityOption[];
}

/**
 * Cobertura por macro + lista de estabelecimentos pra familia selecionada --
 * as duas requisicoes que alimentam o Dashboard inteiro (macros/coberturaRows
 * pros cards e tabela; facilities pras opcoes de filtro em useFiltrosMacro).
 * queryKey inclui `equipmentFamily`: trocar de familia (TOMOGRAFO ->
 * RESSONANCIA -> TOMOGRAFO rapido) e uma query nova, o Query cancela/ignora
 * a resposta antiga sozinho -- substitui a guarda `cancelado` manual que
 * existia aqui antes (documentada no historico do Dashboard).
 */
export function useDashboardCobertura(equipmentFamily: string) {
  const query = useQuery({
    queryKey: ["dashboard-cobertura", equipmentFamily],
    queryFn: async (): Promise<DashboardCoberturaData> => {
      const [coverage, facilities] = await Promise.all([
        fetchMacroCoverage(equipmentFamily),
        fetchFacilities(equipmentFamily),
      ]);
      return {
        macros: coverage.macros,
        coberturaRows: coverage.coberturaRows,
        facilities,
      };
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
