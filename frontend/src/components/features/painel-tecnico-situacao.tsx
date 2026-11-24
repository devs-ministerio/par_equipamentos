import { FASES_ACOMPANHAMENTO } from "@/lib/fases-acompanhamento";
import { cn } from "@/lib/utils";
import { SEM_MONITORAMENTO } from "@/lib/painel-tecnico-filtro";
import type { LinhaCarteira } from "@/services/painel-tecnico";

const GRADE = [0, 25, 50, 75, 100];

function pct(valor: number, total: number): string {
  if (total === 0) return "0%";
  return `${((100 * valor) / total).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

type Coluna = {
  rotulo: string;
  valor: number;
  tom: "fase" | "concluido" | "alerta";
};

const COR_BARRA: Record<Coluna["tom"], string> = {
  fase: "bg-gradient-to-t from-primary to-primary/65",
  concluido: "bg-gradient-to-t from-success to-success/65",
  alerta: "bg-gradient-to-t from-warning to-warning/65",
};

/** Instrumentos da carteira por situação do monitoramento interno (fase oficial) e os ainda não incluídos. */
export function SecaoSituacao({
  linhas,
  selecionada,
  onSelecionar,
}: {
  linhas: LinhaCarteira[];
  selecionada?: string;
  onSelecionar: (rotulo: string | undefined) => void;
}) {
  const contagem = new Map<string, number>();
  let semMonitoramento = 0;
  for (const l of linhas) {
    if (!l.monitorado) semMonitoramento += 1;
    else if (l.fase) contagem.set(l.fase, (contagem.get(l.fase) ?? 0) + 1);
  }
  const colunas: Coluna[] = [
    { rotulo: SEM_MONITORAMENTO, valor: semMonitoramento, tom: "alerta" },
    ...FASES_ACOMPANHAMENTO.map(
      (fase): Coluna => ({
        rotulo: fase,
        valor: contagem.get(fase) ?? 0,
        tom: fase === "Concluído" ? "concluido" : "fase",
      }),
    ),
  ];
  const maximo = Math.max(1, ...colunas.map((c) => c.valor));
  return (
    <section className="flex h-full flex-col rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6">
      <h3 className="m-0 text-base font-semibold tracking-tight">
        Instrumentos por situação
      </h3>
      <div className="mt-6 flex flex-1 overflow-x-auto">
        <div className="relative flex min-h-[18rem] min-w-[44rem] flex-1">
          <div
            className="pointer-events-none absolute inset-x-0 top-10 bottom-[4.75rem]"
            aria-hidden="true"
          >
            {GRADE.map((g) => (
              <div
                key={g}
                className="absolute inset-x-0 border-t border-dashed border-border/70"
                style={{ bottom: `${g}%` }}
              />
            ))}
          </div>
          <ul
            className="relative m-0 flex flex-1 list-none items-stretch gap-2 p-0"
            aria-label="Instrumentos por situação do monitoramento interno"
          >
            {colunas.map((c) => (
              <li key={c.rotulo} className="flex min-w-0 flex-1 flex-col">
                <button
                  type="button"
                  aria-pressed={selecionada === c.rotulo}
                  onClick={() =>
                    onSelecionar(
                      selecionada === c.rotulo ? undefined : c.rotulo,
                    )
                  }
                  title={`${c.rotulo}: ${c.valor} (${pct(c.valor, linhas.length)})`}
                  className={cn(
                    "group flex h-full w-full cursor-pointer flex-col items-center rounded-lg border-0 bg-transparent p-0 pb-1 text-inherit transition-opacity focus-visible:outline-2 focus-visible:outline-ring",
                    selecionada && selecionada !== c.rotulo && "opacity-40",
                  )}
                >
                  <div className="relative w-full flex-1">
                    <div className="absolute inset-0 flex flex-col items-center justify-end">
                      <span className="mb-1 text-base leading-6 font-semibold tabular-nums">
                        {c.valor}
                      </span>
                      <div
                        className={cn(
                          "w-3/5 max-w-14 rounded-t-lg transition-opacity group-hover:opacity-80",
                          COR_BARRA[c.tom],
                        )}
                        style={{
                          height:
                            c.valor > 0
                              ? `calc((100% - 2.5rem) * ${c.valor / maximo})`
                              : "3px",
                          opacity: c.valor > 0 ? undefined : 0.35,
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex h-[4.75rem] w-full flex-col items-center">
                    <span
                      className={cn(
                        "mt-2.5 text-center text-[11px] leading-tight break-normal",
                        c.tom === "alerta"
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {c.rotulo}
                    </span>
                    <span className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                      {pct(c.valor, linhas.length)}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
