import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/common/pagination";
import { SingleSelectFilter } from "@/components/common/single-select-filter";
import { useCandidatosLegados } from "@/hooks/use-candidatos-legados";
import { mensagemSeguraDoErro } from "@/lib/api-error";
import { ROTULOS_SITUACAO } from "@/lib/legado-rotulos";
import { CandidatoLegadoItem } from "./candidato-legado-item";
import type { SituacaoLegado } from "@/services/candidatos-legados";
import { CandidatoLegadoTriagem } from "./candidato-legado-triagem";

export function CandidatosLegados() {
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<SituacaoLegado>();
  const consulta = useCandidatosLegados(true, pagina, busca, situacao);
  return (
    <section aria-label="Candidatos à entrada" className="min-w-0 pb-4">
      <div className="mb-4 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 [&>div]:max-w-none">
        <Input
          className="h-11 sm:h-8"
          aria-label="Buscar candidato legado"
          placeholder="Número do convênio ou proposta"
          maxLength={100}
          value={busca}
          onChange={(event) => {
            setBusca(event.target.value);
            setPagina(1);
          }}
        />
        <SingleSelectFilter
          placeholder="Situação"
          clearLabel="Todas as situações"
          value={situacao ?? null}
          options={Object.entries(ROTULOS_SITUACAO).map(([value, label]) => ({
            value,
            label,
          }))}
          onChange={(valor) => {
            setSituacao(
              Object.keys(ROTULOS_SITUACAO).find(
                (chave): chave is SituacaoLegado => chave === valor,
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
          Nenhum convênio neste recorte. Coleta automática ainda em homologação.
        </p>
      ) : (
        <>
          <ul className="space-y-3 pb-4">
            {consulta.data?.itens.map((candidato) => (
              <CandidatoLegadoItem key={candidato.id} candidato={candidato}>
                <CandidatoLegadoTriagem candidato={candidato} />
              </CandidatoLegadoItem>
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
