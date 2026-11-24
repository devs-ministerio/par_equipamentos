import { PageHeader } from "@/components/common/page-header";
import { RelatorioFiltros } from "@/components/features/relatorio-filtros";
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
  const origemSituacao = situacaoEscolhida?.origem ?? null;

  const carteira = useRelatorioConvenios(filtros, situacaoEscolhida);
  const propostas = useRelatorioPropostas(filtros, situacaoEscolhida);
  const opcoes = useRelatorioOpcoes({
    propostas: propostas.propostas,
    situacaoInstrumentoOptions: carteira.situacaoInstrumentoOptions,
    faseMonitoramento: carteira.faseMonitoramento,
    encerramento: null,
    programaOptions: carteira.programaOptions,
    equipamentoOptions: carteira.equipamentoOptions,
    tipoContratacaoOptions: carteira.tipoContratacaoOptions,
  });
  const escopo = useRelatorioEscopo(
    filtros,
    carteira.convenios,
    situacaoEscolhida,
  );
  const { gerando, erro, gerar } = useGerarRelatorio("instrumentos_repasse");

  const totalRegistros =
    carteira.conveniosFiltrados.length +
    propostas.propostasConfirmadas.length +
    propostas.propostasEmTramitacao.length;
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
        description="Confira o recorte e exporte em Word ou Excel."
        actions={
          <RelatorioEscopoResumo
            escopo={escopo.resumoEscopo}
            rotuloTotal="Registros"
            total={totalRegistros}
          />
        }
      />

      <RelatorioFiltros
        filtros={filtros}
        opcoes={{
          tipo: opcoes.tipoOptions,
          uf: carteira.ufs,
          municipio: carteira.municipioOptions,
          cnes: carteira.cnesOptions,
          equipamento: opcoes.equipamentoTodasOptions,
          situacao: opcoes.situacaoDaVisaoOptions,
          programa: opcoes.programaTodasOptions,
          ano: carteira.anoOptions,
        }}
      />

      <RelatorioResumoCarteira
        instrumentos={carteira.conveniosFiltrados.length}
        valorInstrumentos={carteira.valorGlobalInstrumentos}
        parcerias={propostas.propostasConfirmadas.length}
        propostas={propostas.propostasEmTramitacao.length}
      />

      <div className="border-b border-border pb-3">
        <h2 className="font-display text-xl font-bold tracking-tight">
          Prévia
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {fonteParcial
            ? "A prévia usa parte da fonte; o arquivo consulta tudo de novo e pode trazer mais registros."
            : "O arquivo traz o mesmo recorte da prévia."}
        </p>
      </div>

      <PreviaCarteira
        origemSituacao={origemSituacao}
        carregandoConvenios={carteira.conveniosQuery.isLoading}
        erroConvenios={
          carteira.conveniosQuery.isError ? carteira.conveniosQuery.error : null
        }
        recarregarConvenios={() => void carteira.conveniosQuery.refetch()}
        convenios={carteira.conveniosFiltrados}
        faseMonitoramento={carteira.faseMonitoramento}
        carregandoPropostas={propostas.carregandoPropostas}
        erroPropostas={propostas.erroPropostas}
        confirmadas={propostas.propostasConfirmadas}
        emTramitacao={propostas.propostasEmTramitacao}
        onLimparFiltros={limparFiltros}
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
