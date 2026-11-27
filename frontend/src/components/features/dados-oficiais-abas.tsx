import { cn } from "@/lib/utils";

export function AbasDadosOficiais({
  aba,
  totalInstrumentos,
  totalPropostas,
  onChange,
}: {
  aba: "convenios" | "componentes";
  totalInstrumentos: number;
  totalPropostas: number;
  onChange: (aba: "convenios" | "componentes") => void;
}) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-1 border-b border-border sm:flex">
      {(
        [
          {
            value: "convenios",
            label: "Instrumentos/Programas",
            total: totalInstrumentos,
          },
          {
            value: "componentes",
            label: "Linhas de financiamento",
            total: totalPropostas,
          },
        ] as const
      ).map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={cn(
            "-mb-px min-h-11 min-w-0 cursor-pointer border-none border-b-2 bg-transparent px-2 py-2.5 text-center text-sm font-bold sm:px-4",
            aba === item.value
              ? "border-b-primary text-primary"
              : "border-b-transparent text-muted-foreground",
          )}
        >
          {item.label}
          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
            {item.total}
          </span>
        </button>
      ))}
    </div>
  );
}
