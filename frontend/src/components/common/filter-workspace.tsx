import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

/** Barra de filtros (Seção "Filter workspace" do plan-mode) -- mesma
 * composição usada em Dashboard, Dados Oficiais, Mapa, Relatórios e Mesa de
 * trabalho: label "Filtrar por" + controles (`children`, um por domínio,
 * sem reimplementar aqui) + "Limpar" quando algum filtro está ativo +
 * contagem opcional de resultado. */
export function FilterWorkspace({
  children,
  hasAnyFilter,
  onClear,
  contagem,
  className,
}: {
  children: ReactNode;
  hasAnyFilter?: boolean;
  onClear?: () => void;
  /** Ex.: "12 de 121 resultados". */
  contagem?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-5 flex flex-wrap items-start gap-2.5 rounded-xl border border-border/80 bg-card/70 p-3 shadow-[var(--shadow-soft)]",
        className,
      )}
    >
      {children}
      {hasAnyFilter && onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Limpar filtros"
          className="cursor-pointer rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive"
        >
          <X size={13} className="mr-1 inline" /> Limpar
        </button>
      )}
      {contagem && (
        <span className="w-full pt-1 text-right text-xs text-muted-foreground sm:ml-auto sm:w-auto sm:pt-2">
          {contagem}
        </span>
      )}
    </div>
  );
}
