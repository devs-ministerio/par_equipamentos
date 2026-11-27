import type { FiltrosMonitoramentoInterno } from "@/hooks/use-monitoramento-interno-filtros";
import { montarControlesFiltro } from "./painel-gestao-filtros-controles";
import { ApresentacaoFiltros } from "@/components/common/controles-filtro";

export function PainelGestaoFiltros({
  filtros,
}: {
  filtros: FiltrosMonitoramentoInterno;
}) {
  return <ApresentacaoFiltros controles={montarControlesFiltro(filtros)} />;
}
