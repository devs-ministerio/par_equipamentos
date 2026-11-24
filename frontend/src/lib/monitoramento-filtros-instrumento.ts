import type { InstrumentoEquipamento } from "@/services/monitoramento-instrumentos";
import type { ClasseEquipamento } from "@/types/dados-oficiais";
import { correspondeBuscaLivre } from "@/lib/busca-livre";
import { chaveMunicipio, opcoesMunicipios } from "@/lib/municipio-filtro";
import {
  chaveEquipamentoFiltro,
  type equipamentosPorInstrumento,
} from "@/lib/monitoramento-filtro-equipamentos";

export const SEM_RESPONSAVEL = "Sem responsável";

export type OpcaoFiltro = { value: string; label: string };
export type ClasseEquipamentoFiltro = ClasseEquipamento | "todos";

export const PARAMETROS = [
  "busca",
  "tipo_contratacao",
  "cnes",
  "uf",
  "municipio",
  "classe",
  "equipamento",
  "situacao",
  "programa",
  "responsavel",
  "ano_inicio",
  "ano_fim",
  "referencia",
] as const;

export function paginaValida(valor: string | null): number {
  const pagina = Number(valor);
  return Number.isInteger(pagina) && pagina > 0 ? pagina : 1;
}
export type InstrumentoMonitoramentoFiltravel = Pick<
  InstrumentoEquipamento,
  | "nr_convenio"
  | "cnes"
  | "nome_convenente"
  | "municipio"
  | "uf"
  | "tipo_contratacao"
  | "fase_atual"
  | "situacao_prestacao_contas"
  | "tecnico_titular"
> &
  Partial<
    Pick<
      InstrumentoEquipamento,
      "equipamento_descricao" | "programa" | "ano_instrumento"
    >
  >;

export function opcoes(
  instrumentos: InstrumentoMonitoramentoFiltravel[],
  valor: (instrumento: InstrumentoMonitoramentoFiltravel) => string,
): OpcaoFiltro[] {
  return [...new Set(instrumentos.map(valor))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((value) => ({ value, label: value }));
}

export function opcoesMunicipio(
  instrumentos: InstrumentoMonitoramentoFiltravel[],
): OpcaoFiltro[] {
  return opcoesMunicipios(instrumentos.map((item) => item.municipio)).map(
    ({ value, label }) => ({ value, label }),
  );
}

/** Link com ano que não tem 4 dígitos (ex.: `abc`) vale como filtro ausente. */
export function anoValido(valor: string | null): string | null {
  return valor && /^\d{4}$/.test(valor) ? valor : null;
}

export interface CriteriosFiltroInstrumento {
  busca: string;
  tipoContratacao: string | null;
  cnes: string | null;
  uf: string | null;
  municipio: string | null;
  equipamento: string | null;
  situacao: string | null;
  programa: string | null;
  responsavel: string | null;
  anoInicio: string | null;
  anoFim: string | null;
  marcadoresPorNumero: ReturnType<typeof equipamentosPorInstrumento>;
  anosDe: (instrumento: InstrumentoMonitoramentoFiltravel) => number[];
}

/** Predicado puro dos filtros do monitoramento (todos opcionais; o instrumento precisa passar em todos). */
export function instrumentoCorrespondeAosFiltros(
  instrumento: InstrumentoMonitoramentoFiltravel,
  c: CriteriosFiltroInstrumento,
): boolean {
  if (
    !correspondeBuscaLivre(c.busca, [
      instrumento.nr_convenio,
      instrumento.nome_convenente,
      instrumento.cnes,
      instrumento.municipio,
      instrumento.uf,
      instrumento.tipo_contratacao,
      instrumento.equipamento_descricao,
      instrumento.programa,
      instrumento.tecnico_titular,
      instrumento.fase_atual,
      instrumento.situacao_prestacao_contas,
    ])
  )
    return false;
  if (
    c.tipoContratacao &&
    (instrumento.tipo_contratacao ?? "Convênio") !== c.tipoContratacao
  )
    return false;
  if (c.cnes && instrumento.cnes !== c.cnes) return false;
  if (c.uf && instrumento.uf !== c.uf) return false;
  if (
    c.municipio &&
    chaveMunicipio(instrumento.municipio ?? "") !== c.municipio
  )
    return false;
  if (c.equipamento) {
    const marcadores = c.marcadoresPorNumero.get(instrumento.nr_convenio);
    const confere =
      c.equipamento === "nao informado"
        ? !marcadores?.length
        : marcadores?.some(
            (item) => chaveEquipamentoFiltro(item.nome) === c.equipamento,
          );
    if (!confere) return false;
  }
  if (
    c.situacao &&
    (instrumento.fase_atual ?? "Acompanhamento iniciado") !== c.situacao
  )
    return false;
  if (c.programa && (instrumento.programa ?? "Não informado") !== c.programa)
    return false;
  if (
    c.responsavel &&
    (instrumento.tecnico_titular ?? SEM_RESPONSAVEL) !== c.responsavel
  )
    return false;
  return (
    (!c.anoInicio && !c.anoFim) ||
    c
      .anosDe(instrumento)
      .some(
        (ano) =>
          (!c.anoInicio || ano >= Number(c.anoInicio)) &&
          (!c.anoFim || ano <= Number(c.anoFim)),
      )
  );
}
