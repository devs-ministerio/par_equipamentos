import type { ConvenioUnificado } from "@/types/monitoramento";
import { nomePrioritarioCanonico } from "./equipamento-catalogo";
import { correspondeBuscaLivre } from "./busca-livre";
import { chaveMunicipio, instrumentoEstaNoMunicipio } from "./municipio-filtro";
import type {
  FiltroDadosOficiais,
  FiltroMonitorado,
} from "@/types/dados-oficiais";

type EstadoFiltros = {
  busca?: string;
  uf: string[];
  municipio: string[];
  cnes: string[];
  equipamento: string[];
  situacao: string[];
  anoInicio: string | null;
  anoFim: string | null;
  programa: string[];
  tipoContratacao: string[];
  monitorado: FiltroMonitorado | null;
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
      estado.tipoContratacao.length > 0 &&
      !estado.tipoContratacao.includes(item.tipoContratacao ?? "Convênio")
    )
      return false;
    if (
      ignorar !== "uf" &&
      estado.uf.length > 0 &&
      !estado.uf.includes(item.uf)
    )
      return false;
    if (
      ignorar !== "municipio" &&
      estado.municipio.length > 0 &&
      !estado.municipio.some((m) =>
        instrumentoEstaNoMunicipio(item, chaveMunicipio(m)),
      )
    )
      return false;
    if (
      ignorar !== "cnes" &&
      estado.cnes.length > 0 &&
      !(item.cnes && estado.cnes.includes(item.cnes))
    )
      return false;
    if (
      ignorar !== "equipamento" &&
      estado.equipamento.length > 0 &&
      !item.equipamentos.some((equipamento) =>
        estado.equipamento.includes(
          nomePrioritarioCanonico(equipamento.nome) ?? equipamento.nome,
        ),
      )
    )
      return false;
    if (
      ignorar !== "situacao" &&
      estado.situacao.length > 0 &&
      !estado.situacao.includes(situacaoExibida(item) ?? "")
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
      estado.programa.length > 0 &&
      !estado.programa.includes(item.programa ?? "")
    )
      return false;
    if (
      estado.monitorado !== null &&
      monitorados.has(item.numero) !== (estado.monitorado === "sim")
    )
      return false;
    if (
      estado.busca &&
      !correspondeBuscaLivre(estado.busca, [
        item.numero,
        item.numeroInstrumento,
        item.convenente.nome,
        item.convenente.cnpj,
        item.cnes,
        item.cnesNomeEstabelecimento,
        item.municipio,
        item.uf,
        item.objeto,
      ])
    )
      return false;
    return true;
  });
}
