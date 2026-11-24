import { ErrorAlert } from "@/components/common/error-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { mensagemSeguraDoErro } from "@/lib/api-error";
import type { ConvenioUnificado } from "@/types/monitoramento";
import type { PropostaCandidata } from "@/services/propostas-candidatas";
import type { useRelatorioEncerrados } from "@/hooks/use-relatorio-encerrados";
import type { useRelatorioEntregues } from "@/hooks/use-relatorio-entregues";
import { RelatorioEncerradosPrevia } from "./relatorio-encerrados-previa";
import { RelatorioEntreguesPrevia } from "./relatorio-entregues-previa";
import { RelatorioInstrumentosTabela } from "./relatorio-instrumentos-tabela";
import { RelatorioPropostasTabela } from "./relatorio-propostas-tabela";

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

/** Visão padrão: instrumentos firmados e linhas de financiamento (parcerias e propostas). */
export function PreviaCarteira({
  origemSituacao,
  carregandoConvenios,
  erroConvenios,
  recarregarConvenios,
  convenios,
  faseMonitoramento,
  carregandoPropostas,
  erroPropostas,
  confirmadas,
  emTramitacao,
  onLimparFiltros,
}: {
  origemSituacao: string | null;
  carregandoConvenios: boolean;
  erroConvenios: unknown;
  recarregarConvenios: () => void;
  convenios: ConvenioUnificado[];
  faseMonitoramento: Map<string, string>;
  carregandoPropostas: boolean;
  erroPropostas: unknown;
  confirmadas: PropostaCandidata[];
  emTramitacao: PropostaCandidata[];
  onLimparFiltros?: () => void;
}) {
  const soPropostas = origemSituacao === "proposta";
  const soInstrumentos =
    origemSituacao === "instrumento" || origemSituacao === "monitoramento";
  return (
    <>
      {soPropostas ? null : carregandoConvenios ? (
        <Carregando rotulo="Carregando" />
      ) : erroConvenios ? (
        <ErrorAlert
          mensagem={mensagemSeguraDoErro(erroConvenios)}
          onRetry={recarregarConvenios}
        />
      ) : (
        <RelatorioInstrumentosTabela
          itens={convenios}
          faseMonitoramento={faseMonitoramento}
          onLimparFiltros={onLimparFiltros}
        />
      )}
      {carregandoPropostas ? (
        <Carregando rotulo="Carregando" />
      ) : erroPropostas ? (
        <ErrorAlert mensagem={mensagemSeguraDoErro(erroPropostas)} />
      ) : soInstrumentos ? null : (
        <>
          <RelatorioPropostasTabela
            titulo="Parcerias confirmadas"
            descricao="Instrumentos com parceria formalizada"
            itens={confirmadas}
            onLimparFiltros={onLimparFiltros}
          />
          <RelatorioPropostasTabela
            titulo="Em tramitação"
            descricao="Linhas de financiamento ainda em análise"
            itens={emTramitacao}
            onLimparFiltros={onLimparFiltros}
          />
        </>
      )}
    </>
  );
}
