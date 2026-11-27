import type { OpcaoFiltro } from "@/components/common/opcoes-multiplas";
import type { useDadosOficiaisFiltros } from "@/hooks/use-dados-oficiais-filtros";

export type FiltrosDadosOficiais = ReturnType<typeof useDadosOficiaisFiltros>;

export interface OpcoesDadosOficiais {
  tipoContratacao: OpcaoFiltro[];
  uf: OpcaoFiltro[];
  municipio: OpcaoFiltro[];
  cnes: OpcaoFiltro[];
  equipamento: OpcaoFiltro[];
  situacao: OpcaoFiltro[];
  programa: OpcaoFiltro[];
  ano: OpcaoFiltro[];
}
