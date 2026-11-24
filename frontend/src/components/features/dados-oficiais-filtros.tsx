import { BarraFiltros } from "@/components/common/barra-filtros";
import {
  montarControlesDadosOficiais,
  montarRecortesDadosOficiais,
  type FiltrosDadosOficiais,
  type OpcoesDadosOficiais,
} from "./dados-oficiais-filtros-controles";

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
