import { useMemo } from "react";
import { montarRecorte, opcoesContratacao } from "@/lib/relatorio-recorte";
import { PageHeader } from "@/components/common/page-header";
import {
  RelatorioFiltros,
  RelatorioFiltrosAtivos,
} from "@/components/features/relatorio-filtros";
import { RelatorioBotoesGerar } from "@/components/features/relatorio-botoes-gerar";
import { RelatorioResumoCarteira } from "@/components/features/relatorio-resumo-carteira";
import { RelatorioEscopoResumo } from "@/components/features/relatorio-escopo-resumo";
import { PreviaCarteira } from "@/components/features/relatorio-previa-visao";
import { useRelatorioInstrumentosFiltros } from "@/hooks/use-relatorio-instrumentos-filtros";
import { useRelatorioConvenios } from "@/hooks/use-relatorio-convenios";
import { useRelatorioPropostas } from "@/hooks/use-relatorio-propostas";
import { useRelatorioOpcoes } from "@/hooks/use-relatorio-opcoes";
import { useRelatorioEscopo } from "@/hooks/use-relatorio-escopo";
import { useGerarRelatorio } from "@/hooks/use-gerar-relatorio";
import { decodificarSituacao } from "@/lib/situacao-relatorio";
import { useState } from "react";
import type { NivelRelatorio } from "@/services/relatorios";

const OPCOES_MONITORADO = [
  { value: "propostas", label: "Proposta" },
  { value: "sem", label: "Celebrado" },
  { value: "monitorado", label: "Em monitoramento" },
];

/**
 * Relatório de Instrumentos e Repasse: convênios firmados, parcerias e
 * propostas (linhas de financiamento) e monitoramento interno, em Excel ou
 * Word (`GET /relatorios`). A prévia é o mesmo recorte que o arquivo traz:
 * os filtros (único estado em `useRelatorioInstrumentosFiltros`) cascateiam
 * entre si e viram o filtro de geração em `useRelatorioEscopo`.
 * Plano: docs/planos/planmode-relatorios-paridade-2026-11-24.md (Fase 0).
 */
export function MonitoramentoRelatoriosPage() {
  const [nivel, setNivel] = useState<NivelRelatorio>("simplificado");
  const filtros = useRelatorioInstrumentosFiltros();
  const { hasFiltros } = filtros;
  const situacaoEscolhida = decodificarSituacao(filtros.situacao);

  const carteira = useRelatorioConvenios(filtros, situacaoEscolhida);
  const propostas = useRelatorioPropostas(filtros, situacaoEscolhida);
  const opcoes = useRelatorioOpcoes({
    propostas: propostas.propostas,
    situacaoInstrumentoOptions: carteira.situacaoInstrumentoOptions,
    faseMonitoramento: carteira.faseMonitoramento,
    encerramento: null,
    programaOptions: carteira.programaOptions,
    equipamentoOptions: carteira.equipamentoOptions,
  });
  const escopo = useRelatorioEscopo(
    filtros,
    carteira.convenios,
    situacaoEscolhida,
  );
  const { gerando, erro, gerar } = useGerarRelatorio("instrumentos_repasse");

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
    monitorado: OPCOES_MONITORADO,
    uf: carteira.ufs,
    municipio: carteira.municipioOptions,
    cnes: carteira.cnesOptions,
    equipamento: opcoes.equipamentoTodasOptions,
    situacao: opcoes.situacaoDaVisaoOptions,
    programa: opcoes.programaTodasOptions,
    ano: carteira.anoOptions,
  };
  const limparFiltros = hasFiltros ? filtros.limparFiltros : undefined;
  const fonteParcial =
    carteira.totalConveniosFonte > carteira.convenios.length ||
    propostas.totalPropostasFonte > propostas.propostas.length;

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        className="mb-0"
        eyebrow="Monitoramento interno"
        title="Relatórios"
        description="Filtre o recorte e gere o relatório em Word ou Excel."
        actions={
          <RelatorioEscopoResumo
            escopo={escopo.resumoEscopo}
            rotuloTotal="Registros"
            total={recorte.total}
          />
        }
      />

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

      <RelatorioBotoesGerar
        nivel={nivel}
        onNivelChange={setNivel}
        podeGerar={!escopo.municipioAmbiguo && !escopo.estabelecimentoAmbiguo}
        gerando={gerando}
        erro={erro}
        contexto={
          escopo.municipioAmbiguo
            ? "Há municípios com este nome em mais de uma UF. Selecione a UF antes de exportar."
            : escopo.estabelecimentoAmbiguo
              ? "Há mais de um CNES com este nome. Selecione o CNES antes de exportar."
              : `Recorte de ${escopo.resumoEscopo}, com os filtros acima.`
        }
        onGerar={(formato) => void gerar(formato, nivel, escopo.filtroGeracao)}
      />
    </div>
  );
}
