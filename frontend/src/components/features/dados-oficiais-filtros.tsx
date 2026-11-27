import { BarraFiltros } from "@/components/common/barra-filtros";
import { montarControlesDadosOficiais } from "./dados-oficiais-filtros-controles";
import { montarRecortesDadosOficiais } from "./dados-oficiais-filtros-recortes";
import type {
  FiltrosDadosOficiais,
  OpcoesDadosOficiais,
} from "./dados-oficiais-filtros-tipos";

/** Filtros de Dados oficiais no mesmo padrão do Painel de gestão. */
export function DadosOficiaisFiltros({
  filtros,
  opcoes,
  aviso,
}: {
  filtros: FiltrosDadosOficiais;
  opcoes: OpcoesDadosOficiais;
  aviso?: string;
}) {
  return (
    <BarraFiltros
      controles={montarControlesDadosOficiais(filtros, opcoes)}
      recortes={montarRecortesDadosOficiais(filtros, opcoes)}
      onLimpar={filtros.limparFiltros}
      aviso={aviso}
      rotulo="Filtros de dados oficiais"
    />
  );
}
