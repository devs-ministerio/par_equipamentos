import { PageHeader } from "@/components/common/page-header";
import { RelatorioGeradorForm } from "@/components/features/relatorio-gerador-form";
import { NavBoxesAnaliseMerito } from "@/components/features/nav-boxes-analise-merito";
import { useFamiliaEquipamento } from "../hooks/use-familia-equipamento";
import { MetodologiaPage } from "./metodologia-page";

/**
 * Página de Relatórios -- geração de relatórios Excel/Word (Plan Mode
 * docs/arquitetura/planmode-relatorios-2026-09-25.md) + a Metodologia (que
 * antes tinha item próprio no menu, virou seção aqui). A geração roda
 * inteira no backend (`GET /relatorios`, cobertura + convênios +
 * monitoramento numa chamada só) -- substitui os cards de exportação
 * client-side (jspdf/exceljs, desativados desde 2026-08-24) que só
 * cobriam cobertura/estabelecimentos da família selecionada no dashboard.
 */
export function RelatoriosPage() {
  const { familia: FAMILIA } = useFamiliaEquipamento();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Análise de mérito"
        title="Relatórios e metodologia"
        description="Relatórios em Excel e Word, filtrados por Brasil, região, UF, município ou CNES, e critérios de cálculo para análise externa."
        actions={<NavBoxesAnaliseMerito />}
      />
      <section aria-label="Geração de relatórios">
        <RelatorioGeradorForm />
      </section>

      <MetodologiaPage equipmentFamily={FAMILIA} />
    </div>
  );
}
