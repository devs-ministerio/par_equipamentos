import { Link } from "react-router-dom";
import { DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CandidatosLegados } from "./candidatos-legados";

export function CentralEntradas({ onNavigate }: { onNavigate: () => void }) {
  return (
    <>
      <header className="shrink-0 border-b border-border px-6 py-5 pr-12">
        <DialogTitle>Central de entradas</DialogTitle>
        <DialogDescription className="mt-1">
          Verificação de novos convênios legados antes da entrada na carteira.
        </DialogDescription>
      </header>
      <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain px-6 pb-6">
        <p className="mt-4 text-sm text-muted-foreground">
          Propostas da nova API seguem diretamente para{" "}
          <Link
            className="text-primary underline underline-offset-4"
            to="/monitoramento-equipamentos?aba=componentes"
            onClick={onNavigate}
          >
            Linhas de financiamento
          </Link>
          . Esta central não altera o fluxo de propostas em tramitação.
        </p>
        <CandidatosLegados />
      </div>
    </>
  );
}
