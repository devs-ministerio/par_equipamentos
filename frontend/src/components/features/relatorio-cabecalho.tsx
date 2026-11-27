import { ArrowDown } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { RelatorioEscopoResumo } from "./relatorio-escopo-resumo";

export const ID_EXPORTAR_RELATORIO = "relatorio-exportar";
export const ID_TIPO_RELATORIO = "relatorio-tipo";

function irParaExportacao() {
  const destino = document.getElementById(ID_EXPORTAR_RELATORIO);
  if (!destino) return;
  const seletor = document.getElementById(ID_TIPO_RELATORIO);
  const foco =
    seletor instanceof HTMLButtonElement && !seletor.disabled
      ? seletor
      : destino;
  foco.focus({ preventScroll: true });
  const reduzirMovimento = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  destino.scrollIntoView({
    behavior: reduzirMovimento ? "instant" : "smooth",
    block: "start",
  });
}

export function RelatorioCabecalho({
  escopo,
  rotulo = "Registros",
  total,
}: {
  escopo: string;
  rotulo?: string;
  total?: number;
}) {
  return (
    <PageHeader
      className="mb-0 [&>div]:grid [&>div]:auto-rows-fr [&>div]:items-stretch lg:[&>div]:grid-cols-[minmax(0,1fr)_auto]"
      eyebrow="Monitoramento interno"
      title="Relatórios"
      description="Filtre o recorte e gere o relatório em Word ou Excel."
      actions={
        <div className="flex w-full items-stretch gap-[3px] sm:w-auto">
          <div className="min-w-0 flex-1">
            <RelatorioEscopoResumo
              escopo={escopo}
              rotuloTotal={rotulo}
              total={total}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-auto shrink-0 rounded-2xl border-border/80 bg-card px-3 font-semibold shadow-[var(--shadow-soft)] sm:px-4"
            onClick={irParaExportacao}
          >
            <ArrowDown aria-hidden="true" />
            Exportar
          </Button>
        </div>
      }
    />
  );
}
