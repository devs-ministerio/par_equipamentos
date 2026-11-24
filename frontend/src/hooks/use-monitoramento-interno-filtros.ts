import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
export type {
  ClasseEquipamentoFiltro,
  InstrumentoMonitoramentoFiltravel,
} from "@/lib/monitoramento-filtros-instrumento";
import type { ResumoMonitoramento } from "@/services/monitoramento-resumo";
import { anosEmOperacao } from "@/lib/painel-gestao-andamento";
import { chaveMunicipio } from "@/lib/municipio-filtro";
import {
  PARAMETROS,
  SEM_RESPONSAVEL,
  anoValido,
  instrumentoCorrespondeAosFiltros,
  opcoes,
  opcoesMunicipio,
  paginaValida,
  type ClasseEquipamentoFiltro,
  type InstrumentoMonitoramentoFiltravel,
} from "@/lib/monitoramento-filtros-instrumento";
import {
  anosPorReferencia,
  referenciaValida,
  type DataDeInauguracao,
  type ReferenciaPeriodo,
} from "@/lib/referencia-periodo-painel";
import {
  chaveEquipamentoFiltro,
  equipamentosPorInstrumento,
  opcoesEquipamentosFiltro,
  type FonteEquipamentosFiltro,
} from "@/lib/monitoramento-filtro-equipamentos";

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
  /** Datas de inauguração por instrumento; quando informadas, o período pode olhar o evento (D41). */
  inauguracoes: readonly DataDeInauguracao[] | null = null,
  etapasDeOperacao:
    | readonly ResumoMonitoramento["etapas_por_instrumento"][number][]
    | null = null,
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
  const responsavel = searchParams.get("responsavel");
  const referencia = referenciaValida(
    searchParams.get("referencia"),
    etapasDeOperacao !== null,
  );
  const anosPorInstrumento = useMemo(() => {
    if (referencia === "inicio_operacao") {
      return new Map(
        (etapasDeOperacao ?? []).map((etapa) => [
          etapa.nr_convenio,
          Array.from(anosEmOperacao(etapa), Number),
        ]),
      );
    }
    return new Map(
      Array.from(
        anosPorReferencia(referencia, inauguracoes ?? []),
        ([numero, ano]) => [numero, [ano]],
      ),
    );
  }, [referencia, inauguracoes, etapasDeOperacao]);
  const porEvento = referencia !== "ano_instrumento";
  const anosDe = useCallback(
    (instrumento: InstrumentoMonitoramentoFiltravel) =>
      porEvento
        ? (anosPorInstrumento.get(instrumento.nr_convenio) ?? [])
        : instrumento.ano_instrumento == null
          ? []
          : [instrumento.ano_instrumento],
    [porEvento, anosPorInstrumento],
  );
  const anoInicio = anoValido(searchParams.get("ano_inicio"));
  const anoFim = anoValido(searchParams.get("ano_fim"));
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
      instrumentos.filter((instrumento) =>
        instrumentoCorrespondeAosFiltros(instrumento, {
          busca,
          tipoContratacao,
          cnes,
          uf,
          municipio,
          equipamento,
          situacao,
          programa,
          responsavel,
          anoInicio,
          anoFim,
          marcadoresPorNumero,
          anosDe,
        }),
      ),
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
      responsavel,
      anoInicio,
      anoFim,
      anosDe,
    ],
  );

  // Instrumentos que o período por evento deixa de fora por não terem a data (acessíveis ao zerar a referência).
  const semDataNaReferencia = useMemo(
    () =>
      porEvento ? instrumentos.filter((i) => anosDe(i).length === 0).length : 0,
    [porEvento, instrumentos, anosDe],
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
    setUfComMunicipio: (valor: string | null) => {
      setSearchParams(
        (anteriores) => {
          const proximos = new URLSearchParams(anteriores);
          if (valor) proximos.set("uf", valor);
          else proximos.delete("uf");
          const municipioAtual = proximos.get("municipio");
          if (
            valor &&
            municipioAtual &&
            !instrumentos.some(
              (item) =>
                item.uf === valor &&
                chaveMunicipio(item.municipio ?? "") ===
                  chaveMunicipio(municipioAtual),
            )
          ) {
            proximos.delete("municipio");
          }
          proximos.delete("pagina");
          return proximos;
        },
        { replace: true },
      );
    },
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
    responsavel,
    setResponsavel: (valor: string | null) =>
      definirFiltro("responsavel", valor),
    referencia,
    // Trocar a referência muda o significado dos anos; o intervalo anterior não vale mais.
    setReferencia: (valor: string | null) => {
      setSearchParams(
        (anteriores) => {
          const proximos = new URLSearchParams(anteriores);
          if (valor) proximos.set("referencia", valor);
          else proximos.delete("referencia");
          proximos.delete("ano_inicio");
          proximos.delete("ano_fim");
          proximos.delete("pagina");
          return proximos;
        },
        { replace: true },
      );
    },
    temReferencias: inauguracoes !== null,
    semDataNaReferencia,
    anoInicio,
    setAnoInicio: (valor: string | null) => definirFiltro("ano_inicio", valor),
    anoFim,
    setAnoFim: (valor: string | null) => definirFiltro("ano_fim", valor),
    setPeriodo: (
      inicio: string | null,
      fim: string | null,
      novaReferencia?: ReferenciaPeriodo,
    ) => {
      // useSearchParams não enfileira dois setters como useState.
      setSearchParams(
        (anteriores) => {
          const proximos = new URLSearchParams(anteriores);
          if (inicio) proximos.set("ano_inicio", inicio);
          else proximos.delete("ano_inicio");
          if (fim) proximos.set("ano_fim", fim);
          else proximos.delete("ano_fim");
          if (novaReferencia === "ano_instrumento")
            proximos.delete("referencia");
          else if (novaReferencia) proximos.set("referencia", novaReferencia);
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

export type FiltrosMonitoramentoInterno = ReturnType<
  typeof useMonitoramentoInternoFiltros
>;
