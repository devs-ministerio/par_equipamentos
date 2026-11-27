import { BarraFiltros } from "@/components/common/barra-filtros";
import { ChipsFiltrosAtivos } from "@/components/common/chips-filtros-ativos";
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
      className="mb-0"
      controles={montarControlesRelatorio(filtros, opcoes)}
      recortes={[]}
      onLimpar={filtros.limparFiltros}
      rotulo="Filtros do relatório"
    />
  );
}

/** Filtros ativos do relatório, removíveis um a um, no cabeçalho da prévia. */
export function RelatorioFiltrosAtivos({
  filtros,
  opcoes,
}: {
  filtros: FiltrosRelatorio;
  opcoes: OpcoesRelatorio;
}) {
  return (
    <ChipsFiltrosAtivos
      recortes={montarRecortesRelatorio(filtros, opcoes)}
      limpar={filtros.limparFiltros}
    />
  );
}
