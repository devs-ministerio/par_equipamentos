import type { ReactNode } from "react";
import { ErrorAlert } from "@/components/common/error-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { mensagemSeguraDoErro } from "@/lib/api-error";
import type { LinhaRelatorio } from "@/lib/relatorio-linhas";
import type { useRelatorioEncerrados } from "@/hooks/use-relatorio-encerrados";
import type { useRelatorioEntregues } from "@/hooks/use-relatorio-entregues";
import { RelatorioEncerradosPrevia } from "./relatorio-encerrados-previa";
import { RelatorioEntreguesPrevia } from "./relatorio-entregues-previa";
import { RelatorioRegistrosTabela } from "./relatorio-registros-tabela";

function Carregando({ rotulo }: { rotulo: string }) {
  return <Skeleton className="h-64 w-full" role="status" aria-label={rotulo} />;
}

export function PreviaEntregues({
  entregues,
}: {
  entregues: ReturnType<typeof useRelatorioEntregues>;
}) {
  if (entregues.isLoading) return <Carregando rotulo="Carregando entregues" />;
  if (entregues.isError)
    return (
      <ErrorAlert
        mensagem={mensagemSeguraDoErro(entregues.error)}
        onRetry={() => entregues.refetch()}
      />
    );
  if (!entregues.data) return null;
  return (
    <RelatorioEntreguesPrevia
      itens={entregues.data.itens}
      total={entregues.data.total}
      pagina={entregues.pagina}
      onPaginaChange={entregues.setPagina}
    />
  );
}

export function PreviaEncerrados({
  encerrados,
}: {
  encerrados: ReturnType<typeof useRelatorioEncerrados>;
}) {
  if (encerrados.isLoading)
    return <Carregando rotulo="Carregando concluídos" />;
  if (encerrados.isError)
    return (
      <ErrorAlert
        mensagem={mensagemSeguraDoErro(encerrados.error)}
        onRetry={() => encerrados.refetch()}
      />
    );
  if (!encerrados.data) return null;
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Uma linha por instrumento ou parceria. Ordem paga não comprova quitação
        integral nem conclusão física.
      </p>
      <RelatorioEncerradosPrevia
        titulo="Concluídos"
        itens={encerrados.data.itens}
        total={encerrados.data.total}
        pagina={encerrados.pagina}
        onPaginaChange={encerrados.setPagina}
      />
      <RelatorioEncerradosPrevia
        titulo="Pendências excluídas dos concluídos"
        itens={encerrados.data.pendencias}
        total={encerrados.data.total_pendencias}
        pagina={encerrados.paginaPendencias}
        onPaginaChange={encerrados.setPaginaPendencias}
      />
    </>
  );
}

/** Prévia do relatório: uma tabela só com instrumentos (Convênios e PERSUS I e II), linhas de financiamento confirmadas e propostas. */
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
