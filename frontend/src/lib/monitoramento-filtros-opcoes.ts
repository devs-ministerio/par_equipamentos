import type {
  ClasseEquipamentoFiltro,
  InstrumentoMonitoramentoFiltravel,
} from "@/lib/monitoramento-filtros-instrumento";
import {
  SEM_RESPONSAVEL,
  opcoes,
  opcoesMunicipio,
} from "@/lib/monitoramento-filtros-instrumento";
import {
  opcoesEquipamentosFiltro,
  type FonteEquipamentosFiltro,
} from "@/lib/monitoramento-filtro-equipamentos";

/** Opções de cada seletor de filtro, calculadas sobre todos os instrumentos. */
export function montarOpcoesFiltros(
  instrumentos: InstrumentoMonitoramentoFiltravel[],
  uf: string | null,
  classeEquipamento: ClasseEquipamentoFiltro,
  fontesEquipamentos: readonly FonteEquipamentosFiltro[],
  anosDe: (instrumento: InstrumentoMonitoramentoFiltravel) => number[],
) {
  return {
    tipoContratacaoOptions: opcoes(
      instrumentos,
      (item) => item.tipo_contratacao ?? "Convênio",
    ),
    cnesOptions: opcoes(
      instrumentos.filter((item) => item.cnes),
      (item) => item.cnes!,
    ),
    ufOptions: opcoes(
      instrumentos.filter((item) => item.uf),
      (item) => item.uf!,
    ),
    municipioOptions: opcoesMunicipio(instrumentos),
    municipioOptionsPorUf: opcoesMunicipio(
      uf ? instrumentos.filter((item) => item.uf === uf) : instrumentos,
    ),
    equipamentoOptions: opcoesEquipamentosFiltro(
      new Set(instrumentos.map((item) => item.nr_convenio)),
      fontesEquipamentos,
      classeEquipamento,
    ),
    situacaoOptions: opcoes(
      instrumentos,
      (item) => item.fase_atual ?? "Acompanhamento iniciado",
    ),
    programaOptions: opcoes(
      instrumentos,
      (item) => item.programa ?? "Não informado",
    ),
    responsavelOptions: opcoes(
      instrumentos,
      (item) => item.tecnico_titular ?? SEM_RESPONSAVEL,
    ),
    anoOptions: [...new Set(instrumentos.flatMap(anosDe))]
      .sort((a, b) => b - a)
      .map((ano) => ({ value: String(ano), label: String(ano) })),
  };
}
