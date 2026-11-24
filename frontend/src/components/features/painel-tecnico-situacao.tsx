import { FASES_ACOMPANHAMENTO } from "@/lib/fases-acompanhamento";
import { PainelCartao } from "@/components/features/painel-gestao-cartao";
import { corDaFase, COR_PREVISTA } from "@/lib/monitoramento-painel-palette";
import { cn } from "@/lib/utils";
import { SEM_MONITORAMENTO } from "@/lib/painel-tecnico-filtro";
import type { LinhaCarteira } from "@/services/painel-tecnico";

const GRADE = [0, 25, 50, 75, 100];

function pct(valor: number, total: number): string {
  if (total === 0) return "0%";
  return `${((100 * valor) / total).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

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
  const colunas = [
    { rotulo: SEM_MONITORAMENTO, valor: semMonitoramento, cor: COR_PREVISTA },
    ...FASES_ACOMPANHAMENTO.map((fase) => ({
      rotulo: fase,
      valor: contagem.get(fase) ?? 0,
      cor: corDaFase(fase, FASES_ACOMPANHAMENTO),
    })),
  ];
  const maximo = Math.max(1, ...colunas.map((c) => c.valor));
  return (
    <PainelCartao titulo="Instrumentos por situação">
      <div className="flex flex-1 overflow-x-auto">
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
                    "group flex h-full w-full cursor-pointer flex-col items-center rounded-md border-0 bg-transparent p-0 pb-1 text-inherit transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring",
                    selecionada === c.rotulo && "bg-primary/10",
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
                          c.valor === 0 && "bg-border",
                        )}
                        style={{
                          height:
                            c.valor > 0
                              ? `calc((100% - 2.5rem) * ${c.valor / maximo})`
                              : "3px",
                          background: c.valor > 0 ? c.cor : undefined,
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex h-[4.75rem] w-full flex-col items-center">
                    <span
                      className={cn(
                        "mt-2.5 text-center text-[11px] leading-tight break-normal",
                        c.rotulo === SEM_MONITORAMENTO
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
    </PainelCartao>
  );
}
