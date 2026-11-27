import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type RecortePainel = {
  rotulo: string;
  valor: string;
  remover: () => void;
};

/** Etiquetas dos filtros ativos, cada uma removível, com "Limpar filtros". */
export function ChipsFiltrosAtivos({
  recortes,
  limpar,
}: {
  recortes: RecortePainel[];
  limpar: () => void;
}) {
  if (!recortes.length) return null;
  return (
    <div
      role="group"
      aria-label="Filtros ativos"
      className="flex min-w-0 flex-wrap items-center gap-1.5"
    >
      {recortes.map(({ rotulo, valor, remover }) => (
        <button
          key={rotulo}
          type="button"
          aria-label={`Remover filtro ${rotulo}: ${valor}`}
          title={`${rotulo}: ${valor}`}
          className="flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-ring"
          onClick={remover}
        >
          <span className="truncate">
            {rotulo}: {valor}
          </span>
          <X className="size-3 shrink-0" aria-hidden="true" />
        </button>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 text-xs"
        onClick={limpar}
      >
        Limpar filtros
      </Button>
    </div>
  );
}
