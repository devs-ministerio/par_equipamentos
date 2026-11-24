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
}: {
  fatias: FatiaRosca[];
  rotuloTotal: string;
}) {
  const total = fatias.reduce((soma, f) => soma + f.valor, 0);
  if (total === 0)
    return (
      <p className="m-0 text-sm text-muted-foreground">
        Nenhum instrumento neste recorte.
      </p>
    );
  let acumulado = 0;
  return (
    <div className="flex flex-1 flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div className="relative size-40 shrink-0">
        <svg
          viewBox="0 0 36 36"
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
          <li
            key={f.rotulo}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto_3rem] items-center gap-2 text-sm"
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
          </li>
        ))}
      </ul>
    </div>
  );
}
