import { useQuery } from "@tanstack/react-query";
import { fetchHealthRegionCoverage } from "@/services/api";
import type { NivelCoberturaRow } from "@/types/domain";

type Dados = NivelCoberturaRow[] | "carregando" | "erro";

/**
 * Regiões de saúde de UMA macro -- busca sob demanda, só quando a macro é
 * expandida pela primeira vez (`enabled`), igual ao padrão já usado no Mapa
 * pra buscar por UF. queryKey inclui `macroId`: expandir uma macro diferente
 * é uma query nova e independente, então a resposta de uma nunca sobrescreve
 * a outra (cada `<CoberturaMacroRow>` tem sua própria chamada deste hook).
 */
export function useHealthRegionByMacro(
  equipmentFamily: string,
  macroId: string,
  enabled: boolean,
) {
  const query = useQuery({
    queryKey: ["health-region-coverage-by-macro", equipmentFamily, macroId],
    queryFn: () =>
      fetchHealthRegionCoverage({ equipmentFamily, macroCodes: [macroId] }),
    enabled,
  });

  const dados: Dados = query.isLoading
    ? "carregando"
    : query.isError
      ? "erro"
      : (query.data ?? []);
  return { dados };
}
