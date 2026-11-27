import { useQuery } from "@tanstack/react-query";
import { consultarPreviaRelatorio } from "@/services/relatorios-previa";
import type {
  FiltroRelatorio,
  NivelRelatorio,
  TipoRelatorio,
} from "@/services/relatorios";

export function useRelatorioPrevia(
  tipo: Exclude<TipoRelatorio, "analise_merito">,
  nivel: NivelRelatorio,
  filtro: FiltroRelatorio,
  pagina: number,
  habilitada: boolean,
) {
  return useQuery({
    enabled: habilitada,
    queryKey: ["relatorios", "previa", tipo, nivel, filtro, pagina],
    queryFn: ({ signal }) =>
      consultarPreviaRelatorio(tipo, nivel, filtro, pagina, signal),
  });
}
