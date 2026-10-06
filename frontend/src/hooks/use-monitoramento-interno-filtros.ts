import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { InstrumentoEquipamento } from "@/services/monitoramento-instrumentos";
import { nomePrioritarioCanonico } from "@/lib/equipamento-catalogo";
import type { ClasseEquipamento } from "@/types/dados-oficiais";
import { capitalizarNome, normalizarTexto } from "@/utils/texto";
import { correspondeBuscaLivre } from "@/lib/busca-livre";

type OpcaoFiltro = { value: string; label: string };
export type ClasseEquipamentoFiltro = ClasseEquipamento | "todos";

const PARAMETROS = [
  "busca",
  "tipo_contratacao",
  "cnes",
  "uf",
  "municipio",
  "classe",
  "equipamento",
  "situacao",
  "programa",
  "ano_inicio",
  "ano_fim",
] as const;

function paginaValida(valor: string | null): number {
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

function opcoes(
  instrumentos: InstrumentoMonitoramentoFiltravel[],
  valor: (instrumento: InstrumentoMonitoramentoFiltravel) => string,
): OpcaoFiltro[] {
  return [...new Set(instrumentos.map(valor))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((value) => ({ value, label: value }));
}

function opcoesMunicipio(
  instrumentos: InstrumentoMonitoramentoFiltravel[],
): OpcaoFiltro[] {
  const municipios = new Map<string, string>();
  for (const instrumento of instrumentos) {
    if (!instrumento.municipio) continue;
    const chave = normalizarTexto(instrumento.municipio);
    // A chave é estável para filtro; o rótulo evita variantes de caixa na UI.
    municipios.set(chave, capitalizarNome(instrumento.municipio));
  }
  return [...municipios.entries()]
    .sort(([, nomeA], [, nomeB]) => nomeA.localeCompare(nomeB, "pt-BR"))
    .map(([value, label]) => ({ value, label }));
}

function chaveEquipamento(descricao: string | null | undefined): string {
  if (!descricao) return "nao informado";
  return nomePrioritarioCanonico(descricao) ?? normalizarTexto(descricao);
}

function opcoesEquipamento(
  instrumentos: InstrumentoMonitoramentoFiltravel[],
  classeEquipamento: ClasseEquipamentoFiltro,
): OpcaoFiltro[] {
  const equipamentos = new Map<string, string>();
  for (const instrumento of instrumentos) {
    const descricao = instrumento.equipamento_descricao;
    if (!descricao) continue;
    const prioritario = nomePrioritarioCanonico(descricao) !== null;
    if (
      classeEquipamento !== "todos" &&
      (classeEquipamento === "prioritario") !== prioritario
    )
      continue;
    const chave = chaveEquipamento(descricao);
    equipamentos.set(
      chave,
      nomePrioritarioCanonico(descricao) ?? capitalizarNome(descricao),
    );
  }
  return [...equipamentos.entries()]
    .sort(([, nomeA], [, nomeB]) => nomeA.localeCompare(nomeB, "pt-BR"))
    .map(([value, label]) => ({ value, label }));
}

/** Filtros das visões de monitoramento refletidos na URL.
 *
 * A fonte é a mesma lista usada pela mesa e pelo painel; não mistura dados
 * internos com os cálculos de cobertura. A URL preserva o recorte quando o
 * usuário abre um instrumento, recarrega a página ou compartilha o link. */
export function useMonitoramentoInternoFiltros<
  T extends InstrumentoMonitoramentoFiltravel,
>(instrumentos: T[]) {
  const [searchParams, setSearchParams] = useSearchParams();
  const busca = searchParams.get("busca") ?? "";
  const tipoContratacao = searchParams.get("tipo_contratacao");
  const cnes = searchParams.get("cnes");
  const uf = searchParams.get("uf");
  const municipio = searchParams.get("municipio");
  const classeNaUrl = searchParams.get("classe");
  const classeEquipamento: ClasseEquipamentoFiltro =
    classeNaUrl === "prioritario" || classeNaUrl === "outro"
      ? classeNaUrl
      : "todos";
  const equipamento = searchParams.get("equipamento");
  const situacao = searchParams.get("situacao");
  const programa = searchParams.get("programa");
  const anoInicio = searchParams.get("ano_inicio");
  const anoFim = searchParams.get("ano_fim");
  const pagina = paginaValida(searchParams.get("pagina"));

  const definirFiltro = useCallback(
    (chave: (typeof PARAMETROS)[number], valor: string | null) => {
      setSearchParams(
        (anteriores) => {
          const proximos = new URLSearchParams(anteriores);
          if (valor) proximos.set(chave, valor);
          else proximos.delete(chave);
          proximos.delete("pagina");
          if (chave === "classe") proximos.delete("equipamento");
          return proximos;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setPagina = useCallback(
    (proximaPagina: number) => {
      setSearchParams(
        (anteriores) => {
          const proximos = new URLSearchParams(anteriores);
          if (proximaPagina <= 1) proximos.delete("pagina");
          else proximos.set("pagina", String(proximaPagina));
          return proximos;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const filtrados = useMemo(
    () =>
      instrumentos.filter((instrumento) => {
        if (
          !correspondeBuscaLivre(busca, [
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
          tipoContratacao &&
          (instrumento.tipo_contratacao ?? "Convênio") !== tipoContratacao
        )
          return false;
        if (cnes && instrumento.cnes !== cnes) return false;
        if (uf && instrumento.uf !== uf) return false;
        if (
          municipio &&
          normalizarTexto(instrumento.municipio ?? "") !== municipio
        )
          return false;
        if (
          equipamento &&
          chaveEquipamento(instrumento.equipamento_descricao) !== equipamento
        )
          return false;
        if (situacao && (instrumento.fase_atual ?? "Não iniciado") !== situacao)
          return false;
        if (programa && (instrumento.programa ?? "Não informado") !== programa)
          return false;
        if (
          anoInicio &&
          (instrumento.ano_instrumento == null ||
            instrumento.ano_instrumento < Number(anoInicio))
        )
          return false;
        if (
          anoFim &&
          (instrumento.ano_instrumento == null ||
            instrumento.ano_instrumento > Number(anoFim))
        )
          return false;
        return true;
      }),
    [
      instrumentos,
      busca,
      tipoContratacao,
      cnes,
      uf,
      municipio,
      equipamento,
      situacao,
      programa,
      anoInicio,
      anoFim,
    ],
  );

  const limparFiltros = useCallback(() => {
    setSearchParams(
      (anteriores) => {
        const proximos = new URLSearchParams(anteriores);
        for (const parametro of PARAMETROS) proximos.delete(parametro);
        proximos.delete("pagina");
        return proximos;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  return {
    filtrados,
    total: instrumentos.length,
    busca,
    setBusca: (valor: string) => definirFiltro("busca", valor.trim() || null),
    tipoContratacao,
    setTipoContratacao: (valor: string | null) =>
      definirFiltro("tipo_contratacao", valor),
    cnes,
    setCnes: (valor: string | null) => definirFiltro("cnes", valor),
    uf,
    setUf: (valor: string | null) => definirFiltro("uf", valor),
    municipio,
    setMunicipio: (valor: string | null) => definirFiltro("municipio", valor),
    classeEquipamento,
    setClasseEquipamento: (valor: ClasseEquipamentoFiltro) =>
      definirFiltro("classe", valor === "todos" ? null : valor),
    equipamento,
    setEquipamento: (valor: string | null) =>
      definirFiltro("equipamento", valor),
    situacao,
    setSituacao: (valor: string | null) => definirFiltro("situacao", valor),
    programa,
    setPrograma: (valor: string | null) => definirFiltro("programa", valor),
    anoInicio,
    setAnoInicio: (valor: string | null) => definirFiltro("ano_inicio", valor),
    anoFim,
    setAnoFim: (valor: string | null) => definirFiltro("ano_fim", valor),
    pagina,
    setPagina,
    hasFiltros: PARAMETROS.some((parametro) => searchParams.has(parametro)),
    limparFiltros,
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
    equipamentoOptions: opcoesEquipamento(instrumentos, classeEquipamento),
    situacaoOptions: opcoes(
      instrumentos,
      (item) => item.fase_atual ?? "Não iniciado",
    ),
    programaOptions: opcoes(
      instrumentos,
      (item) => item.programa ?? "Não informado",
    ),
    anoOptions: [
      ...new Set(
        instrumentos
          .map((item) => item.ano_instrumento)
          .filter((ano): ano is number => ano != null),
      ),
    ]
      .sort((a, b) => b - a)
      .map((ano) => ({ value: String(ano), label: String(ano) })),
  };
}

export type FiltrosMonitoramentoInterno = ReturnType<
  typeof useMonitoramentoInternoFiltros
>;
