import { PageHeader } from "@/components/common/page-header";
import { CandidatosLegados } from "@/components/features/candidatos-legados";
import { Link } from "react-router-dom";

export function CentralEntradasPage() {
  return (
    <main className="min-w-0">
      <PageHeader
        eyebrow="Monitoramento interno"
        title="Central de entradas"
        description="Verificação de novos convênios legados antes da entrada na carteira."
      />
      <p className="mt-4 text-sm text-muted-foreground">
        Propostas da nova API seguem diretamente para{" "}
        <Link
          className="text-primary underline underline-offset-4"
          to="/monitoramento-equipamentos?aba=componentes"
        >
          Linhas de financiamento
        </Link>
        . Esta central não altera o fluxo de propostas em tramitação.
      </p>
      <CandidatosLegados />
    </main>
  );
}
