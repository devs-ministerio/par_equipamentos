import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

/** Barra de filtros (Seção "Filter workspace" do plan-mode) -- mesma
 * composição já usada ad hoc em Dashboard/Mapa/Relatórios/Mesa de
 * trabalho: label "Filtrar por" + controles (`children`, um por domínio,
 * sem reimplementar aqui) + "Limpar" quando algum filtro está ativo +
 * contagem opcional de resultado. Formalizada aqui pra virar o único
 * padrão, migrado rota a rota nas Etapas 5-7 (não aplicado ainda). */
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
    <div className={cn('mb-4 flex flex-wrap items-start gap-2.5 border-y border-border py-3.5', className)}>
      <span className="pt-2 text-xs font-semibold whitespace-nowrap text-muted-foreground">Filtrar por</span>
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
      {contagem && <span className="ml-auto pt-2 text-xs text-muted-foreground whitespace-nowrap">{contagem}</span>}
    </div>
  );
}
