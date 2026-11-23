import { PainelSecao } from "@/components/features/monitoramento-painel-visuals";
import { FASES_ACOMPANHAMENTO } from "@/lib/fases-acompanhamento";
import { cn } from "@/lib/utils";
import type { LinhaCarteira } from "@/services/painel-tecnico";

const SEM_MONITORAMENTO = "Sem monitoramento";

/** Instrumentos da carteira por situação do monitoramento interno (fase oficial) e os que ainda não foram incluídos. */
export function SecaoSituacao({ linhas }: { linhas: LinhaCarteira[] }) {
  const contagem = new Map<string, number>();
  let semMonitoramento = 0;
  for (const l of linhas) {
    if (!l.monitorado) semMonitoramento += 1;
    else if (l.fase) contagem.set(l.fase, (contagem.get(l.fase) ?? 0) + 1);
  }
  const colunas = [
    ...FASES_ACOMPANHAMENTO.map((fase) => ({
      rotulo: fase,
      valor: contagem.get(fase) ?? 0,
      destaque: false,
    })),
    { rotulo: SEM_MONITORAMENTO, valor: semMonitoramento, destaque: true },
  ];
  const maximo = Math.max(1, ...colunas.map((c) => c.valor));
  return (
    <PainelSecao
      titulo="Instrumentos por situação"
      apoio={`${linhas.length} instrumentos`}
    >
      <div className="overflow-x-auto">
        <ul
          className="m-0 flex min-w-[36rem] list-none items-end gap-3 p-0"
          aria-label="Instrumentos por situação do monitoramento interno"
        >
          {colunas.map((c) => (
            <li
              key={c.rotulo}
              className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
            >
              <span className="text-sm font-semibold tabular-nums">
                {c.valor}
              </span>
              <div className="flex h-44 w-full items-end">
                <div
                  className={cn(
                    "w-full rounded-t-md",
                    c.destaque ? "bg-warning" : "bg-primary",
                  )}
                  style={{
                    height:
                      c.valor > 0 ? `${(100 * c.valor) / maximo}%` : "2px",
                  }}
                />
              </div>
              <span
                className={cn(
                  "text-center text-xs leading-tight",
                  c.destaque
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {c.rotulo}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </PainelSecao>
  );
}
