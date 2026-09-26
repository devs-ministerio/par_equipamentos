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
  semRotulo,
}: {
  children: ReactNode;
  hasAnyFilter?: boolean;
  onClear?: () => void;
  /** Ex.: "12 de 121 resultados". */
  contagem?: string;
  className?: string;
  /** Omite o label "Filtrar por" -- pedido do usuário 2026-09-26 na página
   * de Relatórios; default `false` mantém o label nos demais consumidores
   * (Dashboard, Dados Oficiais, Mapa, Mesa de trabalho). */
  semRotulo?: boolean;
}) {
  return (
    <div
      className={cn(
        "mb-4 flex flex-wrap items-start gap-2.5 border-y border-border py-3.5",
        className,
      )}
    >
      {!semRotulo && (
        <span className="pt-2 text-xs font-semibold whitespace-nowrap text-muted-foreground">
          Filtrar por
        </span>
      )}
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
        <span className="ml-auto pt-2 text-xs text-muted-foreground whitespace-nowrap">
          {contagem}
        </span>
      )}
    </div>
  );
}
