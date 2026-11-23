import { FASES_ACOMPANHAMENTO } from "@/lib/fases-acompanhamento";
import { cn } from "@/lib/utils";
import type { LinhaCarteira } from "@/services/painel-tecnico";

const SEM_MONITORAMENTO = "Sem monitoramento";
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
export function SecaoSituacao({ linhas }: { linhas: LinhaCarteira[] }) {
  const contagem = new Map<string, number>();
  let semMonitoramento = 0;
  for (const l of linhas) {
    if (!l.monitorado) semMonitoramento += 1;
    else if (l.fase) contagem.set(l.fase, (contagem.get(l.fase) ?? 0) + 1);
  }
  const monitorados = linhas.length - semMonitoramento;
  const colunas: Coluna[] = [
    ...FASES_ACOMPANHAMENTO.map(
      (fase): Coluna => ({
        rotulo: fase,
        valor: contagem.get(fase) ?? 0,
        tom: fase === "Concluído" ? "concluido" : "fase",
      }),
    ),
    { rotulo: SEM_MONITORAMENTO, valor: semMonitoramento, tom: "alerta" },
  ];
  const maximo = Math.max(1, ...colunas.map((c) => c.valor));
  return (
    <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h3 className="m-0 text-base font-semibold tracking-tight">
            Instrumentos por situação
          </h3>
          <p className="m-0 mt-1 text-xs text-muted-foreground">
            Fase no monitoramento interno
          </p>
        </div>
        <dl className="m-0 flex gap-6">
          <div>
            <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Instrumentos
            </dt>
            <dd className="m-0 font-display text-xl font-semibold tabular-nums">
              {linhas.length}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Monitorados
            </dt>
            <dd className="m-0 font-display text-xl font-semibold text-primary tabular-nums">
              {pct(monitorados, linhas.length)}
            </dd>
          </div>
        </dl>
      </div>
      <div className="mt-6 overflow-x-auto">
        <div className="relative min-w-[36rem]">
          <div
            className="pointer-events-none absolute inset-x-0 top-[30px] h-44"
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
            className="relative m-0 flex list-none items-end gap-3 p-0"
            aria-label="Instrumentos por situação do monitoramento interno"
          >
            {colunas.map((c) => (
              <li
                key={c.rotulo}
                className="group flex min-w-0 flex-1 flex-col items-center"
                title={`${c.rotulo}: ${c.valor} (${pct(c.valor, linhas.length)})`}
              >
                <span className="mb-1.5 text-base font-semibold tabular-nums">
                  {c.valor}
                </span>
                <div className="flex h-44 w-full items-end justify-center">
                  <div
                    className={cn(
                      "w-3/5 max-w-14 rounded-t-lg transition-opacity group-hover:opacity-80",
                      COR_BARRA[c.tom],
                    )}
                    style={{
                      height:
                        c.valor > 0 ? `${(100 * c.valor) / maximo}%` : "3px",
                      opacity: c.valor > 0 ? undefined : 0.35,
                    }}
                  />
                </div>
                <span
                  className={cn(
                    "mt-2.5 text-center text-xs leading-tight",
                    c.tom === "alerta"
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {c.rotulo}
                </span>
                <span className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                  {pct(c.valor, linhas.length)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
