import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ContagemRotulo } from "@/services/monitoramento-resumo";
import { PALETA_CATEGORICA } from "@/lib/monitoramento-painel-palette";

export function PainelSecao({
  titulo,
  apoio,
  children,
  className,
}: {
  titulo: string;
  apoio?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-t border-border pt-4", className)}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold tracking-tight">{titulo}</h3>
        {apoio && (
          <span className="text-xs text-muted-foreground">{apoio}</span>
        )}
      </div>
      {children}
    </section>
  );
}

export function DistribuicaoHorizontal({
  itens,
  total,
  limite,
}: {
  itens: ContagemRotulo[];
  total?: number;
  limite?: number;
}) {
  const [expandido, setExpandido] = useState(false);
  const cortado = Boolean(limite) && !expandido && itens.length > (limite ?? 0);
  const visiveis = cortado ? itens.slice(0, limite) : itens;
  const restantes = cortado ? itens.slice(limite) : [];
  const somaRestantes = restantes.reduce((s, i) => s + i.quantidade, 0);
  const maior = Math.max(1, ...visiveis.map((item) => item.quantidade));
  return (
    <div className="divide-y divide-border">
      {visiveis.map((item, indice) => (
        <div
          key={item.rotulo}
          className="grid grid-cols-[minmax(0,1.5fr)_minmax(3rem,3fr)_auto] items-center gap-3 py-3 transition-colors duration-150 hover:bg-muted/30"
        >
          <span
            className="truncate text-xs text-foreground"
            title={item.rotulo}
          >
            {item.rotulo}
          </span>
          <div
            className="h-2 overflow-hidden rounded-sm bg-muted"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-sm"
              style={{
                width: `${(item.quantidade / maior) * 100}%`,
                backgroundColor:
                  PALETA_CATEGORICA[indice % PALETA_CATEGORICA.length],
              }}
            />
          </div>
          <span className="min-w-10 text-right text-xs font-semibold">
            {item.quantidade}
            {total ? (
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                {Math.round((item.quantidade / total) * 100)}%
              </span>
            ) : null}
          </span>
        </div>
      ))}
      {cortado && (
        <div className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs text-muted-foreground">
          <span>
            + {restantes.length} outras categorias ({somaRestantes} no total)
          </span>
          <button
            type="button"
            onClick={() => setExpandido(true)}
            className="cursor-pointer font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Ver todos
          </button>
        </div>
      )}
      {limite && expandido && itens.length > limite && (
        <div className="py-3 text-right text-xs">
          <button
            type="button"
            onClick={() => setExpandido(false)}
            className="cursor-pointer font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Mostrar menos
          </button>
        </div>
      )}
    </div>
  );
}
