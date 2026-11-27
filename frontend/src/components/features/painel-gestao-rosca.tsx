import { cn } from "@/lib/utils";

export interface FatiaRosca {
  rotulo: string;
  valor: number;
  cor: string;
}

const RAIO = 15.9155; // circunferência 100
const COR_FUNDO = "var(--secondary)";

/** Rosca com o total no centro e legenda com quantidade e participação. */
export function GraficoRosca({
  fatias,
  rotuloTotal,
  selecionada,
  onSelecionar,
}: {
  fatias: FatiaRosca[];
  rotuloTotal: string;
  /** Rótulo da fatia filtrada; as demais ficam esmaecidas. */
  selecionada?: string | null;
  /** Com esta prop, fatias e legenda viram botões que filtram o painel. */
  onSelecionar?: (rotulo: string) => void;
}) {
  const total = fatias.reduce((soma, f) => soma + f.valor, 0);
  if (total === 0)
    return (
      <p className="m-0 text-sm text-muted-foreground">
        Nenhum instrumento neste recorte.
      </p>
    );
  const Tag = onSelecionar ? "button" : "div";
  let acumulado = 0;
  return (
    <div className="flex flex-1 flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div className="relative size-40 shrink-0">
        <svg
          viewBox="-1.5 -1.5 39 39"
          className="size-full -rotate-90"
          role="img"
          aria-label={fatias.map((f) => `${f.rotulo}: ${f.valor}`).join("; ")}
        >
          <circle
            cx="18"
            cy="18"
            r={RAIO}
            fill="none"
            stroke={COR_FUNDO}
            strokeWidth="4.5"
          />
          {fatias
            .filter((f) => f.valor > 0)
            .map((f) => {
              const parte = (100 * f.valor) / total;
              const inicio = acumulado;
              acumulado += parte;
              return (
                <circle
                  key={f.rotulo}
                  cx="18"
                  cy="18"
                  r={RAIO}
                  fill="none"
                  stroke={f.cor}
                  strokeWidth="4.5"
                  strokeDasharray={`${Math.max(parte - 0.6, 0.1)} ${100 - Math.max(parte - 0.6, 0.1)}`}
                  strokeDashoffset={-inicio}
                  className={cn(
                    onSelecionar && "cursor-pointer",
                    selecionada && selecionada !== f.rotulo && "opacity-30",
                  )}
                  onClick={onSelecionar && (() => onSelecionar(f.rotulo))}
                >
                  <title>{`${f.rotulo}: ${f.valor}`}</title>
                </circle>
              );
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <strong className="font-display text-3xl leading-none font-bold tabular-nums">
            {total}
          </strong>
          <span className="mt-1 text-xs text-muted-foreground">
            {rotuloTotal}
          </span>
        </div>
      </div>
      <ul className="m-0 grid w-full min-w-0 list-none gap-2.5 p-0">
        {fatias.map((f) => (
          <li key={f.rotulo}>
            <Tag
              {...(onSelecionar
                ? {
                    type: "button" as const,
                    "aria-pressed": selecionada === f.rotulo,
                    onClick: () => onSelecionar(f.rotulo),
                  }
                : {})}
              className={cn(
                "grid w-full grid-cols-[auto_minmax(0,1fr)_auto_3rem] items-center gap-2 rounded-md border-0 bg-transparent p-1 text-left text-sm text-inherit",
                onSelecionar &&
                  "cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring",
                selecionada === f.rotulo && "bg-primary/10",
                selecionada && selecionada !== f.rotulo && "opacity-40",
              )}
            >
              <i
                aria-hidden="true"
                className="size-2.5 rounded-sm"
                style={{ backgroundColor: f.cor }}
              />
              <span className="truncate" title={f.rotulo}>
                {f.rotulo}
              </span>
              <strong className="tabular-nums">{f.valor}</strong>
              <span className="text-right text-xs text-muted-foreground tabular-nums">
                {Math.round((100 * f.valor) / total)}%
              </span>
            </Tag>
          </li>
        ))}
      </ul>
    </div>
  );
}
