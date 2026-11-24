import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
export type {
  ClasseEquipamentoFiltro,
  InstrumentoMonitoramentoFiltravel,
} from "@/lib/monitoramento-filtros-instrumento";
import type { ResumoMonitoramento } from "@/services/monitoramento-resumo";
import { useAcoesFiltrosUrl } from "@/hooks/use-acoes-filtros-url";
import { montarOpcoesFiltros } from "@/lib/monitoramento-filtros-opcoes";
import { useAnosPorReferencia } from "@/hooks/use-anos-por-referencia";
import { chaveMunicipio } from "@/lib/municipio-filtro";
import {
  PARAMETROS,
  anoValido,
  instrumentoCorrespondeAosFiltros,
  paginaValida,
  type ClasseEquipamentoFiltro,
  type InstrumentoMonitoramentoFiltravel,
} from "@/lib/monitoramento-filtros-instrumento";
import {
  referenciaValida,
  type DataDeInauguracao,
} from "@/lib/referencia-periodo-painel";
import {
  chaveEquipamentoFiltro,
  equipamentosPorInstrumento,
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
  const [searchParams] = useSearchParams();
  const {
    definirFiltro,
    setPagina,
    limparFiltros,
    setUfComMunicipio,
    setReferencia,
    setPeriodo,
  } = useAcoesFiltrosUrl(instrumentos);
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
  const { anosDe, porEvento } = useAnosPorReferencia(
    referencia,
    inauguracoes,
    etapasDeOperacao,
  );
  const anoInicio = anoValido(searchParams.get("ano_inicio"));
  const anoFim = anoValido(searchParams.get("ano_fim"));
  const pagina = paginaValida(searchParams.get("pagina"));

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
    setUfComMunicipio,
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
    setReferencia,
    temReferencias: inauguracoes !== null,
    semDataNaReferencia,
    anoInicio,
    setAnoInicio: (valor: string | null) => definirFiltro("ano_inicio", valor),
    anoFim,
    setAnoFim: (valor: string | null) => definirFiltro("ano_fim", valor),
    setPeriodo,
    pagina,
    setPagina,
    hasFiltros: PARAMETROS.some((parametro) => searchParams.has(parametro)),
    limparFiltros,
    ...montarOpcoesFiltros(
      instrumentos,
      uf,
      classeEquipamento,
      fontesEquipamentos,
      anosDe,
    ),
  };
}

export type FiltrosMonitoramentoInterno = ReturnType<
  typeof useMonitoramentoInternoFiltros
>;
