import type { ConvenioUnificado } from "@/types/monitoramento";
import { nomePrioritarioCanonico } from "./equipamento-catalogo";
import type { FiltroDadosOficiais } from "@/types/dados-oficiais";

type EstadoFiltros = {
  uf: string | null;
  municipio: string | null;
  cnes: string | null;
  equipamento: string | null;
  situacao: string | null;
  anoInicio: string | null;
  anoFim: string | null;
  programa: string | null;
  tipoContratacao: string | null;
  soMonitorados: boolean;
};
export function filtrarDadosOficiais(
  itens: ConvenioUnificado[],
  estado: EstadoFiltros,
  monitorados: Set<string>,
  situacaoExibida: (item: ConvenioUnificado) => string | null,
  ignorar?: FiltroDadosOficiais,
) {
  return itens.filter((item) => {
    if (
      ignorar !== "tipo" &&
      estado.tipoContratacao &&
      (item.tipoContratacao ?? "Convênio") !== estado.tipoContratacao
    )
      return false;
    if (ignorar !== "uf" && estado.uf && item.uf !== estado.uf) return false;
    if (
      ignorar !== "municipio" &&
      estado.municipio &&
      item.municipio !== estado.municipio
    )
      return false;
    if (ignorar !== "cnes" && estado.cnes && item.cnes !== estado.cnes)
      return false;
    if (
      ignorar !== "equipamento" &&
      estado.equipamento &&
      !item.equipamentos.some(
        (equipamento) =>
          (nomePrioritarioCanonico(equipamento.nome) ?? equipamento.nome) ===
          estado.equipamento,
      )
    )
      return false;
    if (
      ignorar !== "situacao" &&
      estado.situacao &&
      situacaoExibida(item) !== estado.situacao
    )
      return false;
    if (
      ignorar !== "anoInicio" &&
      estado.anoInicio &&
      (item.anoInstrumento === null ||
        item.anoInstrumento < Number(estado.anoInicio))
    )
      return false;
    if (
      ignorar !== "anoFim" &&
      estado.anoFim &&
      (item.anoInstrumento === null ||
        item.anoInstrumento > Number(estado.anoFim))
    )
      return false;
    if (
      ignorar !== "programa" &&
      estado.programa &&
      item.programa !== estado.programa
    )
      return false;
    if (estado.soMonitorados && !monitorados.has(item.numero)) return false;
    return true;
  });
}
