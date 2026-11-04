import { rotuloTipoContratacao } from "@/lib/financiamento-manual";
import { fmtMoeda } from "@/lib/monitoramento-format";
import { cn } from "@/lib/utils";
import { estiloCard, StatusPill } from "./monitoramento-ui";
import { LinkDetalheInstrumento } from "./link-detalhe-instrumento";
import type { InstrumentoEquipamento } from "@/services/monitoramento-instrumentos";

/** Instrumento FAF ou TED de carga manual, mostrado entre as linhas de financiamento. */
export function CardInstrumentoManual({ i }: { i: InstrumentoEquipamento }) {
  return (
    <div className={cn(estiloCard, "mb-3 min-w-0 max-sm:px-4 max-sm:py-3.5")}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="rounded-[5px] bg-secondary px-[9px] py-0.5 font-mono text-[11.5px] font-bold text-primary">
              {rotuloTipoContratacao(i.tipo_contratacao)}
            </span>
            <LinkDetalheInstrumento
              nrConvenio={i.nr_convenio}
              className="font-mono text-[11.5px] text-primary underline"
            >
              {i.nr_convenio}
            </LinkDetalheInstrumento>
            {i.ano_instrumento && (
              <span className="font-mono text-[11.5px] text-muted-foreground">
                {i.ano_instrumento}
              </span>
            )}
          </div>
          <div className="text-[15px] font-bold text-foreground">
            {i.nome_convenente}
          </div>
          {i.cnes && (
            <span className="mt-0.5 inline-block rounded-full bg-secondary px-2 py-0.5 font-mono text-[10.5px] font-bold text-primary">
              CNES {i.cnes}
            </span>
          )}
          <div className="mt-0.5 text-xs text-muted-foreground">
            {i.municipio || "—"}/{i.uf || "—"}
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-start gap-3 sm:flex-col sm:items-end">
          <StatusPill texto={i.situacao_programa} />
          <div className="min-w-0 sm:text-right">
            <div className="text-[10px] uppercase text-muted-foreground">
              Valor planejado
            </div>
            <div className="break-words text-base font-extrabold tabular-nums text-foreground">
              {fmtMoeda(i.investimento_aquisicao)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
