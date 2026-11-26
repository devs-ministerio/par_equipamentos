import { useMemo } from "react";
import { montarRecorte, opcoesContratacao } from "@/lib/relatorio-recorte";
import {
  RelatorioFiltros,
  RelatorioFiltrosAtivos,
} from "@/components/features/relatorio-filtros";
import { RelatorioExportacaoCarteira } from "./relatorio-exportacao-carteira";
import { montarRecortesRelatorio } from "./relatorio-filtros-controles";
import { RelatorioResumoCarteira } from "@/components/features/relatorio-resumo-carteira";
import { RelatorioCabecalho } from "./relatorio-cabecalho";
import { PreviaCarteira } from "@/components/features/relatorio-previa-visao";
import { useRelatorioInstrumentosFiltros } from "@/hooks/use-relatorio-instrumentos-filtros";
import { useRelatorioConvenios } from "@/hooks/use-relatorio-convenios";
import { useRelatorioPropostas } from "@/hooks/use-relatorio-propostas";
import { useRelatorioOpcoes } from "@/hooks/use-relatorio-opcoes";
import { useRelatorioEscopo } from "@/hooks/use-relatorio-escopo";
import { decodificarSituacao } from "@/lib/situacao-relatorio";

const OPCOES_MONITORADO = [
  { value: "propostas", label: "Proposta" },
  { value: "sem", label: "Celebrado" },
  { value: "monitorado", label: "Em monitoramento" },
] as const;

/**
 * Relatório de Instrumentos e Repasse: convênios firmados, parcerias e
 * propostas (linhas de financiamento) e monitoramento interno, em Excel ou
 * Word (`GET /relatorios`). `useRelatorioEscopo` monta o filtro de geração
 * com os parâmetros que o endpoint aceita.
 * Plano: docs/planos/planmode-relatorios-paridade-2026-11-24.md (Fase 0).
 */
export function RelatorioCarteira() {
  const filtros = useRelatorioInstrumentosFiltros();
  const etapaSelecionada = OPCOES_MONITORADO.find(
    (opcao) => opcao.value === filtros.monitorado,
  )?.value;
  const { hasFiltros } = filtros;
  const situacaoEscolhida = decodificarSituacao(filtros.situacao);

  const carteira = useRelatorioConvenios(filtros, situacaoEscolhida);
  const propostas = useRelatorioPropostas(filtros, situacaoEscolhida);
  const opcoes = useRelatorioOpcoes({
    propostas: propostas.propostas,
    situacaoInstrumentoOptions: carteira.situacaoInstrumentoOptions,
    faseMonitoramento: carteira.faseMonitoramento,
    programaOptions: carteira.programaOptions,
    equipamentoOptions: carteira.equipamentoOptions,
  });
  const escopo = useRelatorioEscopo(
    filtros,
    carteira.convenios,
    situacaoEscolhida,
  );

  const recorte = useMemo(
    () =>
      montarRecorte(
        carteira.conveniosFiltrados,
        propostas.propostasConfirmadas,
        propostas.propostasEmTramitacao,
        carteira.faseMonitoramento,
        filtros.monitorado,
      ),
    [
      filtros.monitorado,
      carteira.conveniosFiltrados,
      propostas.propostasConfirmadas,
      propostas.propostasEmTramitacao,
      carteira.faseMonitoramento,
    ],
  );
  const tipoOptions = useMemo(
    () =>
      opcoesContratacao(
        montarRecorte(
          carteira.conveniosSemTipo,
          propostas.parceriasSemTipo,
          propostas.solicitacoesSemTipo,
          carteira.faseMonitoramento,
          filtros.monitorado,
        ),
      ),
    [
      filtros.monitorado,
      carteira.conveniosSemTipo,
      carteira.faseMonitoramento,
      propostas.parceriasSemTipo,
      propostas.solicitacoesSemTipo,
    ],
  );
  const opcoesFiltros = {
    tipo: tipoOptions,
    monitorado: [...OPCOES_MONITORADO],
    uf: carteira.ufs,
    municipio: carteira.municipioOptions,
    cnes: carteira.cnesOptions,
    equipamento: opcoes.equipamentoTodasOptions,
    situacao: opcoes.situacaoOptions,
    programa: opcoes.programaTodasOptions,
    ano: carteira.anoOptions,
  };
  const limparFiltros = hasFiltros ? filtros.limparFiltros : undefined;
  const fonteParcial =
    carteira.totalConveniosFonte > carteira.convenios.length ||
    propostas.totalPropostasFonte > propostas.propostas.length;

  return (
    <>
      <RelatorioCabecalho escopo={escopo.resumoEscopo} total={recorte.total} />
      <RelatorioFiltros filtros={filtros} opcoes={opcoesFiltros} />

      <RelatorioResumoCarteira
        tiposInstrumentos={recorte.instrumentos.map((l) => l.tipo)}
        tiposParcerias={recorte.confirmadas.map((l) => l.tipo)}
        situacoesPropostas={recorte.solicitacoes.map((l) => l.situacao)}
      />

      {fonteParcial && (
        <p className="m-0 text-xs text-muted-foreground">
          A prévia usa parte da fonte; o arquivo consulta tudo de novo e pode
          trazer mais registros.
        </p>
      )}

      <PreviaCarteira
        carregandoConvenios={carteira.conveniosQuery.isLoading}
        erroConvenios={
          carteira.conveniosQuery.isError ? carteira.conveniosQuery.error : null
        }
        recarregarConvenios={() => void carteira.conveniosQuery.refetch()}
        carregandoPropostas={propostas.carregandoPropostas}
        erroPropostas={propostas.erroPropostas}
        linhas={recorte.linhas}
        onLimparFiltros={limparFiltros}
        filtrosAtivos={
          <RelatorioFiltrosAtivos filtros={filtros} opcoes={opcoesFiltros} />
        }
      />

      <RelatorioExportacaoCarteira
        filtro={{ ...escopo.filtroGeracao, etapa: etapaSelecionada }}
        recortes={montarRecortesRelatorio(filtros, opcoesFiltros)}
        escopo={escopo.resumoEscopo}
        bloqueio={
          escopo.municipioAmbiguo
            ? "Há municípios com este nome em mais de uma UF. Selecione a UF antes de exportar."
            : escopo.estabelecimentoAmbiguo
              ? "Há mais de um CNES com este nome. Selecione o CNES antes de exportar."
              : undefined
        }
      />
    </>
  );
}
