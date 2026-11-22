import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/common/pagination";
import { useCandidatosLegados } from "@/hooks/use-candidatos-legados";
import { mensagemSeguraDoErro } from "@/lib/api-error";
import { CandidatoLegadoItem } from "./candidato-legado-item";
import type { SituacaoLegado } from "@/services/candidatos-legados";
import { cn } from "@/lib/utils";
import { CandidatoLegadoTriagem } from "./candidato-legado-triagem";

type Aba = "ativos" | "arquivados";
const SITUACOES_POR_ABA: Record<Aba, SituacaoLegado[]> = {
  ativos: ["novo", "em_analise"],
  arquivados: ["aprovado", "rejeitado"],
};
const ROTULOS_ABA: Record<Aba, string> = {
  ativos: "Aguardando",
  arquivados: "Arquivados",
};

export function CandidatosLegados() {
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState<Aba>("ativos");
  const situacao = SITUACOES_POR_ABA[aba];
  const consulta = useCandidatosLegados(true, pagina, busca, situacao);
  return (
    <section aria-label="Candidatos à entrada" className="min-w-0 pb-4">
      <div
        role="tablist"
        aria-label="Situação dos candidatos"
        className="mb-3 inline-flex rounded-md border border-border bg-muted/40 p-0.5"
      >
        {(Object.keys(ROTULOS_ABA) as Aba[]).map((chave) => (
          <button
            key={chave}
            type="button"
            role="tab"
            aria-selected={aba === chave}
            className={cn(
              "h-8 rounded-[5px] px-4 text-sm font-medium transition-colors",
              aba === chave
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => {
              setAba(chave);
              setPagina(1);
            }}
          >
            {ROTULOS_ABA[chave]}
          </button>
        ))}
      </div>
      <div className="mb-4 grid min-w-0 grid-cols-1 gap-2 [&>div]:max-w-none">
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
        busca.trim() || aba === "arquivados" ? (
          <p className="py-4 text-sm text-muted-foreground">
            {busca.trim()
              ? "Nenhum candidato com essa busca. Limpe a busca para ver a lista inteira."
              : "Nenhum candidato arquivado. Aprovados e rejeitados aparecem aqui."}
          </p>
        ) : (
          <div className="space-y-1 py-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              Sem candidatos elegíveis no momento.
            </p>
            <p>
              A fila reúne convênios do Ministério da Saúde no recorte
              prioritário e celebrado, com confirmação oficial e ainda fora da
              carteira. Registros históricos de capturas anteriores não entram
              aqui enquanto não atendem a esse critério. Consulte o estado da
              coleta acima.
            </p>
          </div>
        )
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
