import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { InstrumentoEquipamento } from "@/services/monitoramento-instrumentos";
import type { ClasseEquipamento } from "@/types/dados-oficiais";
import { correspondeBuscaLivre } from "@/lib/busca-livre";
import { chaveMunicipio, opcoesMunicipios } from "@/lib/municipio-filtro";
import {
  chaveEquipamentoFiltro,
  equipamentosPorInstrumento,
  opcoesEquipamentosFiltro,
  type FonteEquipamentosFiltro,
} from "@/lib/monitoramento-filtro-equipamentos";

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
  return opcoesMunicipios(instrumentos.map((item) => item.municipio)).map(
    ({ value, label }) => ({ value, label }),
  );
}

/** Filtros das visões de monitoramento refletidos na URL.
 *
 * A fonte é a mesma lista usada pela mesa e pelo painel; não mistura dados
 * internos com os cálculos de cobertura. A URL preserva o recorte quando o
 * usuário abre um instrumento, recarrega a página ou compartilha o link. */
export function useMonitoramentoInternoFiltros<
  T extends InstrumentoMonitoramentoFiltravel,
>(
  instrumentos: T[],
  fontesEquipamentos: readonly FonteEquipamentosFiltro[] = [],
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const busca = searchParams.get("busca") ?? "";
  const tipoContratacao = searchParams.get("tipo_contratacao");
  const cnes = searchParams.get("cnes");
  const uf = searchParams.get("uf");
  const municipioNaUrl = searchParams.get("municipio");
  const municipio = municipioNaUrl
    ? chaveMunicipio(municipioNaUrl) || null
    : null;
  const classeNaUrl = searchParams.get("classe");
  const classeEquipamento: ClasseEquipamentoFiltro =
    classeNaUrl === "prioritario" || classeNaUrl === "outro"
      ? classeNaUrl
      : "todos";
  const equipamentoNaUrl = searchParams.get("equipamento");
  const equipamento = equipamentoNaUrl
    ? chaveEquipamentoFiltro(equipamentoNaUrl)
    : null;
  const marcadoresPorNumero = useMemo(
    () => equipamentosPorInstrumento(fontesEquipamentos),
    [fontesEquipamentos],
  );
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
          chaveMunicipio(instrumento.municipio ?? "") !== municipio
        )
          return false;
        if (
          equipamento &&
          !(equipamento === "nao informado"
            ? !marcadoresPorNumero.get(instrumento.nr_convenio)?.length
            : marcadoresPorNumero
                .get(instrumento.nr_convenio)
                ?.some(
                  (item) => chaveEquipamentoFiltro(item.nome) === equipamento,
                ))
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
      marcadoresPorNumero,
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
    // A busca normaliza espaços ao comparar; não apagar o espaço recém-digitado.
    setBusca: (valor: string) => definirFiltro("busca", valor || null),
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
    setPeriodo: (inicio: string | null, fim: string | null) => {
      // useSearchParams não enfileira dois setters como useState.
      setSearchParams(
        (anteriores) => {
          const proximos = new URLSearchParams(anteriores);
          if (inicio) proximos.set("ano_inicio", inicio);
          else proximos.delete("ano_inicio");
          if (fim) proximos.set("ano_fim", fim);
          else proximos.delete("ano_fim");
          proximos.delete("pagina");
          return proximos;
        },
        { replace: true },
      );
    },
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
    equipamentoOptions: opcoesEquipamentosFiltro(
      new Set(instrumentos.map((item) => item.nr_convenio)),
      fontesEquipamentos,
      classeEquipamento,
    ),
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
