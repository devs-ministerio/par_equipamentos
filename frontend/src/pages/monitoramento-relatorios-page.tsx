import { PageHeader } from "@/components/common/page-header";
import { RelatorioGeradorForm } from "@/components/features/relatorio-gerador-form";

/**
 * Relatório de Instrumentos e Repasse -- convênios firmados, propostas
 * candidatas (linhas de financiamento) e monitoramento interno numa
 * chamada só (`GET /relatorios`), em Excel ou Word (Plan Mode
 * docs/arquitetura/planmode-relatorios-2026-09-25.md, Bloco 6). Página
 * própria dentro do Monitoramento Interno, separada do relatório de
 * Análise de Mérito (`relatorios-page.tsx`, cobertura/déficit) -- pedido
 * explícito do usuário: "vamos separar o relatório de instrumentos e
 * repasse do relatório de análise de mérito".
 */
export function MonitoramentoRelatoriosPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Monitoramento interno"
        title="Relatórios"
        description="Convênios, propostas candidatas e monitoramento interno em Excel ou Word, filtrados por Brasil, região, UF, município, CNES ou ano."
      />
      <section aria-label="Geração de relatório de instrumentos e repasse">
        <RelatorioGeradorForm tipoRelatorio="instrumentos_repasse" />
      </section>
    </div>
  );
}
