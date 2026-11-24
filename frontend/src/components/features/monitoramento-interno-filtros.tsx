import { BarraFiltros } from "@/components/common/barra-filtros";
import type { FiltrosMonitoramentoInterno } from "@/hooks/use-monitoramento-interno-filtros";
import { montarControlesFiltro } from "./painel-gestao-filtros-controles";
import { montarRecortes } from "./painel-gestao-recortes";

/** Filtros da Mesa de trabalho: mesmo padrão do Painel de gestão, com todos os filtros da mesa. */
export function MonitoramentoInternoFiltros({
  filtros,
}: {
  filtros: FiltrosMonitoramentoInterno;
}) {
  return (
    <BarraFiltros
      controles={montarControlesFiltro(filtros, true)}
      recortes={montarRecortes(filtros)}
      onLimpar={filtros.limparFiltros}
      contagem={`${filtros.filtrados.length} de ${filtros.total} instrumentos`}
      rotulo="Filtros da mesa de trabalho"
    />
  );
}
