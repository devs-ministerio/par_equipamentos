import type { ConvenioUnificado } from "@/types/monitoramento";
import { normalizarTexto } from "@/utils/texto";
import { nomePrioritarioCanonico } from "./equipamento-catalogo";
import type { FiltroDadosOficiais } from "@/types/dados-oficiais";

type EstadoFiltros = {
  busca: string;
  uf: string | null;
  equipamento: string | null;
  situacao: string | null;
  ano: string | null;
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
      ignorar !== "ano" &&
      estado.ano &&
      item.numeroInstrumento?.split("/")[1] !== estado.ano
    )
      return false;
    if (
      ignorar !== "programa" &&
      estado.programa &&
      item.programa !== estado.programa
    )
      return false;
    if (estado.soMonitorados && !monitorados.has(item.numero)) return false;
    return (
      !estado.busca ||
      normalizarTexto(
        `${item.numero} ${item.convenente.nome} ${item.convenente.cnpj ?? ""} ${item.municipio} ${item.objeto}`,
      ).includes(normalizarTexto(estado.busca))
    );
  });
}
