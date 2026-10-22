import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/common/pagination";
import { useHistoricoLegado } from "@/hooks/useTriagemLegado";
import { ROTULOS_SITUACAO } from "@/lib/legado-rotulos";
import { mensagemSeguraDoErro } from "@/lib/api-error";

export function CandidatoLegadoHistorico({
  candidatoId,
}: {
  candidatoId: number;
}) {
  const [aberta, setAberta] = useState(false);
  const [pagina, setPagina] = useState(1);
  const consulta = useHistoricoLegado(candidatoId, aberta, pagina);
  return (
    <div className="mt-2">
      <Button
        size="sm"
        variant="ghost"
        aria-expanded={aberta}
        aria-controls={`historico-${candidatoId}`}
        onClick={() => setAberta(!aberta)}
      >
        {aberta ? "Fechar histórico" : "Histórico de decisões"}
      </Button>
      {aberta && (
        <div id={`historico-${candidatoId}`} className="mt-3 space-y-3">
          {consulta.isPending ? (
            <Skeleton className="h-20 w-full" />
          ) : consulta.error ? (
            <div role="alert" className="text-sm">
              <p>{mensagemSeguraDoErro(consulta.error)}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void consulta.refetch()}
              >
                Tentar novamente
              </Button>
            </div>
          ) : consulta.data?.total === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma decisão registrada.
            </p>
          ) : (
            <>
              <ol className="space-y-3 border-l-2 border-border pl-3">
                {consulta.data?.itens.map((decisao) => (
                  <li
                    key={decisao.id}
                    className="text-sm [overflow-wrap:anywhere]"
                  >
                    <p className="font-semibold">
                      {ROTULOS_SITUACAO[decisao.situacao]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {decisao.usuario_nome} ·{" "}
                      {new Date(decisao.criado_em).toLocaleString("pt-BR")}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">
                      {decisao.justificativa}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Captura {decisao.captura_id}
                    </p>
                  </li>
                ))}
              </ol>
              {(consulta.data?.total ?? 0) > 10 && (
                <Pagination
                  page={pagina}
                  pageSize={10}
                  totalItems={consulta.data?.total ?? 0}
                  onPageChange={setPagina}
                  mobileStacked
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
