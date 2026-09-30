import { FileCheck2, FileClock, Landmark } from "lucide-react";
import { fmtMoeda } from "@/lib/monitoramento-format";
import { cn } from "@/lib/utils";

/** Faixa estrutural da prévia de relatório. Os números vêm dos mesmos
 * conjuntos filtrados das tabelas; não introduz consulta nem cálculo novo. */
export function RelatorioResumoCarteira({
  instrumentos,
  valorInstrumentos,
  parcerias,
  propostas,
}: {
  instrumentos: number;
  valorInstrumentos: number;
  parcerias: number;
  propostas: number;
}) {
  const itens = [
    {
      label: "Instrumentos e programas",
      value: instrumentos,
      detalhe: fmtMoeda(valorInstrumentos),
      icon: Landmark,
    },
    {
      label: "Parcerias confirmadas",
      value: parcerias,
      detalhe: "linhas de financiamento",
      icon: FileCheck2,
    },
    {
      label: "Propostas em tramitação",
      value: propostas,
      detalhe: "linhas de financiamento",
      icon: FileClock,
    },
  ];

  return (
    <section
      aria-label="Resumo do recorte"
      className="border border-border bg-muted/35"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
        <div>
          <p className="text-[10px] font-bold tracking-[0.12em] text-primary uppercase">
            Visão consolidada
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold tracking-tight text-foreground">
            Resumo da carteira
          </h2>
        </div>
      </div>
      <div className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {itens.map(({ label, value, detalhe, icon: Icon }, indice) => (
          <div
            key={label}
            className={cn(
              "relative flex min-w-0 gap-3 px-4 py-5 sm:px-6 sm:py-6",
              indice === 0 &&
                "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-primary",
            )}
          >
            <Icon
              aria-hidden="true"
              className="mt-1 size-[18px] shrink-0 text-primary"
            />
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
                {label}
              </p>
              <p className="mt-1 font-display text-3xl font-bold tracking-[-0.045em] text-foreground sm:text-4xl">
                {value}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{detalhe}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
