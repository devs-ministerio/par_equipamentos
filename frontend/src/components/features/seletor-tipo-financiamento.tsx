import { cn } from "@/lib/utils";

/** Seletor em pílulas do tipo da linha (Todas, FAF, TED…), com a contagem de cada uma. */
export function SeletorTipoFinanciamento({
  tipos,
  total,
  atual,
  onChange,
}: {
  tipos: { valor: string; total: number }[];
  total: number;
  atual: string | null;
  onChange: (tipo: string | null) => void;
}) {
  const itens: { valor: string | null; rotulo: string; total: number }[] = [
    { valor: null, rotulo: "Todas", total },
    ...tipos.map((t) => ({ valor: t.valor, rotulo: t.valor, total: t.total })),
  ];
  return (
    <div
      role="group"
      aria-label="Tipo de linha de financiamento"
      className="mb-4 inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-muted p-1"
    >
      {itens.map((item) => {
        const ativo = atual === item.valor;
        return (
          <button
            key={item.rotulo}
            type="button"
            aria-pressed={ativo}
            onClick={() => onChange(item.valor)}
            className={cn(
              "flex min-h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring",
              ativo
                ? "bg-card text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.rotulo}
            <span className="rounded-full bg-background px-1.5 text-xs font-medium tabular-nums text-muted-foreground">
              {item.total}
            </span>
          </button>
        );
      })}
    </div>
  );
}
