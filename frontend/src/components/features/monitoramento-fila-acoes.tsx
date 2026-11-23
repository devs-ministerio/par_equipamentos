import { LinkDetalheInstrumento } from "./link-detalhe-instrumento";
import { Pagination } from "@/components/common/pagination";
import { useListaPaginada } from "@/hooks/useListaPaginada";
import { cn } from "@/lib/utils";
import type { AcaoAbertaResumo } from "@/services/monitoramento-resumo";
import { PainelSecao } from "./monitoramento-painel-visuals";

interface Props {
  acoes: AcaoAbertaResumo[];
  acoesPendentes: number;
  filaTruncada: boolean;
  className?: string;
}

export function MonitoramentoFilaAcoes({
  acoes,
  acoesPendentes,
  filaTruncada,
  className,
}: Props) {
  const {
    pagina: paginaAcoes,
    definirPagina: definirPaginaAcoes,
    inicio: inicioAcoes,
  } = useListaPaginada(acoes.length, 8, acoes.map((acao) => acao.id).join("|"));
  return (
    <PainelSecao
      titulo="Fila de ações"
      apoio={`${acoesPendentes} pendentes no recorte`}
      className={className}
    >
      {acoes.length ? (
        <div className="divide-y divide-border">
          {acoes.slice(inicioAcoes, inicioAcoes + 8).map((acao) => (
            <LinkDetalheInstrumento
              key={acao.id}
              nrConvenio={acao.nr_convenio}
              className="group grid gap-1 py-3 text-sm transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4"
            >
              <span className="min-w-0">
                <strong className="block font-semibold text-foreground group-hover:text-primary">
                  {acao.descricao}
                </strong>
                <span className="text-xs text-muted-foreground">
                  {acao.nome_convenente} ·{" "}
                  {acao.responsavel ?? "Responsável não definido"}
                </span>
              </span>
              <span
                className={cn(
                  "text-xs font-semibold sm:text-right",
                  acao.dias != null && acao.dias < 0
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {acao.dias == null
                  ? "Sem prazo"
                  : acao.dias < 0
                    ? `${Math.abs(acao.dias)} dias de atraso`
                    : acao.dias === 0
                      ? "Vence hoje"
                      : `Em ${acao.dias} dias`}
              </span>
            </LinkDetalheInstrumento>
          ))}
        </div>
      ) : (
        <p className="py-6 text-sm text-muted-foreground">
          {acoesPendentes > 0
            ? "Há ações pendentes neste recorte que não estão na lista carregada."
            : "Nenhuma ação pendente neste recorte."}
        </p>
      )}
      {acoes.length > 0 && (
        <nav aria-label="Paginação da fila de ações">
          <Pagination
            page={paginaAcoes}
            totalItems={acoes.length}
            pageSize={8}
            onPageChange={definirPaginaAcoes}
          />
        </nav>
      )}
      {filaTruncada && acoesPendentes > acoes.length && (
        <p className="mt-2 text-xs text-muted-foreground">
          A lista carregada contém as primeiras 500 ações da base por prazo; há
          pendências deste recorte fora dela.
        </p>
      )}
    </PainelSecao>
  );
}
