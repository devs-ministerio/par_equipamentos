import { cn } from "@/lib/utils";

const GRADE = [0, 25, 50, 75, 100];

export interface SegmentoColuna {
  nome: string;
  valor: number;
  /** Cor CSS do segmento (variável ou cor). */
  cor: string;
}

export interface ColunaGrafico {
  rotulo: string;
  segmentos: SegmentoColuna[];
}

export function LegendaSegmentos({
  itens,
}: {
  itens: Array<{ nome: string; cor: string }>;
}) {
  return (
    <ul
      className="m-0 mb-3 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-xs text-muted-foreground"
      aria-label="Legenda"
    >
      {itens.map((item) => (
        <li key={item.nome} className="inline-flex items-center gap-2">
          <i
            aria-hidden="true"
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: item.cor }}
          />
          {item.nome}
        </li>
      ))}
    </ul>
  );
}

/** Colunas verticais (opcionalmente empilhadas) com grade; a base fica no rodapé do cartão. */
export function GraficoColunas({
  colunas,
  vazio,
}: {
  colunas: ColunaGrafico[];
  vazio: string;
}) {
  const totais = colunas.map((c) =>
    c.segmentos.reduce((soma, s) => soma + s.valor, 0),
  );
  const maximo = Math.max(1, ...totais);
  if (colunas.length === 0)
    return <p className="m-0 text-sm text-muted-foreground">{vazio}</p>;
  return (
    <div className="flex flex-1 overflow-x-auto">
      <div className="relative flex min-h-[16rem] min-w-[18rem] flex-1">
        <div
          className="pointer-events-none absolute inset-x-0 top-10 bottom-8"
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
          role="img"
          aria-label={colunas
            .map(
              (c, i) =>
                `${c.rotulo}: ${totais[i]} (${c.segmentos
                  .filter((s) => s.valor > 0)
                  .map((s) => `${s.valor} ${s.nome.toLowerCase()}`)
                  .join(", ")})`,
            )
            .join("; ")}
        >
          {colunas.map((c, i) => (
            <li
              key={c.rotulo}
              className="flex min-w-0 flex-1 flex-col"
              title={`${c.rotulo}: ${c.segmentos
                .map((s) => `${s.valor} ${s.nome.toLowerCase()}`)
                .join(" · ")}`}
            >
              <div className="relative w-full flex-1">
                <div className="absolute inset-0 flex flex-col items-center justify-end">
                  <span className="mb-1 text-base leading-6 font-semibold tabular-nums">
                    {totais[i]}
                  </span>
                  <div
                    className={cn(
                      "flex w-3/5 max-w-14 flex-col-reverse overflow-hidden rounded-t-lg",
                      totais[i] === 0 && "bg-border",
                    )}
                    style={{
                      height:
                        totais[i] > 0
                          ? `calc((100% - 2.5rem) * ${totais[i] / maximo})`
                          : "3px",
                    }}
                  >
                    {c.segmentos
                      .filter((s) => s.valor > 0)
                      .map((s) => (
                        <div
                          key={s.nome}
                          style={{
                            height: `${(100 * s.valor) / totais[i]}%`,
                            background: s.cor,
                          }}
                        />
                      ))}
                  </div>
                </div>
              </div>
              <span className="flex h-8 w-full items-end justify-center pb-0.5 text-center text-[11px] leading-tight font-medium text-muted-foreground tabular-nums">
                {c.rotulo}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
