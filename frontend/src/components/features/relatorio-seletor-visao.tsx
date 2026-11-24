import { cn } from "@/lib/utils";

const VISOES = [
  { valor: null, rotulo: "Carteira e financiamento" },
  { valor: "encerrados", rotulo: "Concluídos" },
  { valor: "entregues", rotulo: "Entregas" },
] as const;

/** Seletor em pílulas da visão do relatório: carteira, concluídos ou entregas por unidade. */
export function RelatorioSeletorVisao({
  atual,
  onChange,
}: {
  atual: string | null;
  onChange: (visao: string | null) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Visão do relatório"
      className="inline-flex max-w-full gap-1 self-start overflow-x-auto rounded-full bg-muted p-1"
    >
      {VISOES.map(({ valor, rotulo }) => {
        const ativo = atual === valor;
        return (
          <button
            key={rotulo}
            type="button"
            aria-pressed={ativo}
            onClick={() => onChange(valor)}
            className={cn(
              "min-h-9 shrink-0 cursor-pointer rounded-full px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring",
              ativo
                ? "bg-card text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {rotulo}
          </button>
        );
      })}
    </div>
  );
}
