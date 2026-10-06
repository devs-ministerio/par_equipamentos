import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/common/pagination";
import { SingleSelectFilter } from "@/components/common/single-select-filter";
import { useCandidatosLegados } from "@/hooks/use-candidatos-legados";
import { mensagemSeguraDoErro } from "@/lib/api-error";
import { ROTULOS_CONFIRMACAO, ROTULOS_RELACAO } from "@/lib/legado-rotulos";
import type { ConfirmacaoLegado } from "@/services/candidatos-legados";

export function CandidatosLegados() {
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState("");
  const [confirmacao, setConfirmacao] = useState<ConfirmacaoLegado>();
  const consulta = useCandidatosLegados(true, pagina, busca, confirmacao);
  return (
    <section
      aria-label="Candidatos à entrada"
      className="mt-6 min-w-0 border-y border-border py-4"
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Evidências do SICONV para avaliação da equipe. Não fazem parte da
        carteira nem do monitoramento interno. Confirmação de publicação não é
        inclusão automática.
      </p>
      <div className="mb-4 grid min-w-0 gap-2 sm:grid-cols-2">
        <Input
          aria-label="Buscar candidato legado"
          placeholder="Buscar número do convênio ou proposta"
          maxLength={100}
          value={busca}
          onChange={(event) => {
            setBusca(event.target.value);
            setPagina(1);
          }}
        />
        <SingleSelectFilter
          placeholder="Confirmação no Portal"
          clearLabel="Todas as confirmações"
          value={confirmacao ?? null}
          options={Object.entries(ROTULOS_CONFIRMACAO).map(
            ([value, label]) => ({ value, label }),
          )}
          onChange={(valor) => {
            setConfirmacao(
              Object.keys(ROTULOS_CONFIRMACAO).find(
                (chave): chave is ConfirmacaoLegado => chave === valor,
              ),
            );
            setPagina(1);
          }}
        />
      </div>
      {consulta.isPending ? (
        <Skeleton className="mb-4 h-24 w-full" />
      ) : consulta.error ? (
        <div role="alert" className="space-y-2 py-4">
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
        <p className="py-4 text-sm text-muted-foreground">
          Nenhum candidato neste recorte. Isso não confirma que a descoberta
          automática já esteja ativa.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {consulta.data?.itens.map((candidato) => (
              <li
                key={candidato.id}
                className="min-w-0 space-y-3 border-l-2 border-primary py-4 pl-4 [overflow-wrap:anywhere]"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold">Convênio {candidato.numero}</h3>
                  <span className="text-xs text-muted-foreground">
                    {ROTULOS_CONFIRMACAO[candidato.confirmacao_portal]}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Proposta SICONV {candidato.id_proposta} · Verificado em{" "}
                  {new Date(candidato.verificado_em).toLocaleString("pt-BR")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {candidato.origem === "snapshot_local"
                    ? "Snapshot local — frescor não confirmado"
                    : "Captura do SICONV"}
                </p>
                <ul className="space-y-2">
                  {candidato.evidencias.map((evidencia) => (
                    <li
                      key={`${evidencia.id_item}-${evidencia.codigo}`}
                      className="text-sm"
                    >
                      <span className="font-medium">{evidencia.nome}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {ROTULOS_RELACAO[evidencia.relacao]} · Item{" "}
                        {evidencia.id_item}
                      </span>
                      <p className="mt-1 text-muted-foreground">
                        {evidencia.descricao}
                      </p>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <Pagination
            page={pagina}
            totalItems={consulta.data?.total ?? 0}
            pageSize={10}
            onPageChange={setPagina}
            mobileStacked
          />
        </>
      )}
    </section>
  );
}
