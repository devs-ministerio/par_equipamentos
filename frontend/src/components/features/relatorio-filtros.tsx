import { BarraFiltros } from "@/components/common/barra-filtros";
import {
  montarControlesRelatorio,
  montarRecortesRelatorio,
  type FiltrosRelatorio,
  type OpcoesRelatorio,
} from "./relatorio-filtros-controles";

/** Filtros dos relatórios no mesmo padrão do Painel de gestão. */
export function RelatorioFiltros({
  filtros,
  opcoes,
}: {
  filtros: FiltrosRelatorio;
  opcoes: OpcoesRelatorio;
}) {
  return (
    <BarraFiltros
      controles={montarControlesRelatorio(filtros, opcoes)}
      recortes={montarRecortesRelatorio(filtros, opcoes)}
      onLimpar={filtros.limparFiltros}
      rotulo="Filtros do relatório"
    />
  );
}
