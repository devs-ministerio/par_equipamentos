import { PageHeader } from "@/components/common/page-header";
import { RelatorioGeradorForm } from "@/components/features/relatorio-gerador-form";
import { NavBoxesAnaliseMerito } from "@/components/features/nav-boxes-analise-merito";
import { useFamiliaEquipamento } from "../hooks/use-familia-equipamento";
import { MetodologiaPage } from "./metodologia-page";

/**
 * Página de Relatórios da Análise de Mérito -- geração do relatório de
 * cobertura/déficit oncológico (Plan Mode docs/arquitetura/
 * planmode-relatorios-2026-09-25.md, Bloco 6: "o relatório de análise de
 * mérito deve ficar onde já construímos os botões") + a Metodologia (que
 * antes tinha item próprio no menu, virou seção aqui). O relatório de
 * instrumentos e repasse (convênios/propostas/monitoramento) vive em
 * página própria dentro do Monitoramento Interno
 * (`monitoramento-relatorios-page.tsx`) -- os dois são relatórios
 * independentes, pedido explícito do usuário.
 */
export function RelatoriosPage() {
  const { familia: FAMILIA } = useFamiliaEquipamento();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Análise de mérito"
        title="Relatórios e metodologia"
        description="Relatório de cobertura/déficit em Excel e Word, filtrado por Brasil, região, UF ou município, e critérios de cálculo para análise externa."
        actions={<NavBoxesAnaliseMerito />}
      />
      <section aria-label="Geração de relatório de análise de mérito">
        <RelatorioGeradorForm />
      </section>

      <MetodologiaPage equipmentFamily={FAMILIA} />
    </div>
  );
}
