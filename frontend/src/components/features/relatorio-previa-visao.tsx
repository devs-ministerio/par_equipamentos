import type { ReactNode } from "react";
import { ErrorAlert } from "@/components/common/error-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { mensagemSeguraDoErro } from "@/lib/api-error";
import type { LinhaRelatorio } from "@/lib/relatorio-linhas";
import { RelatorioRegistrosTabela } from "./relatorio-registros-tabela";

function Carregando({ rotulo }: { rotulo: string }) {
  return <Skeleton className="h-64 w-full" role="status" aria-label={rotulo} />;
}

/** Prévia do relatório: uma tabela só com instrumentos (Convênios, TED e PERSUS I e II), linhas de financiamento confirmadas e propostas. */
export function PreviaCarteira({
  carregandoConvenios,
  erroConvenios,
  recarregarConvenios,
  carregandoPropostas,
  erroPropostas,
  linhas,
  onLimparFiltros,
  filtrosAtivos,
}: {
  carregandoConvenios: boolean;
  erroConvenios: unknown;
  recarregarConvenios: () => void;
  carregandoPropostas: boolean;
  erroPropostas: unknown;
  linhas: LinhaRelatorio[];
  onLimparFiltros?: () => void;
  filtrosAtivos?: ReactNode;
}) {
  if (carregandoConvenios || carregandoPropostas)
    return <Carregando rotulo="Carregando" />;
  return (
    <>
      {erroConvenios ? (
        <ErrorAlert
          mensagem={mensagemSeguraDoErro(erroConvenios)}
          onRetry={recarregarConvenios}
        />
      ) : null}
      {erroPropostas ? (
        <ErrorAlert mensagem={mensagemSeguraDoErro(erroPropostas)} />
      ) : null}
      <RelatorioRegistrosTabela
        itens={linhas}
        onLimparFiltros={onLimparFiltros}
        filtrosAtivos={filtrosAtivos}
      />
    </>
  );
}
