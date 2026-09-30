import { Button } from "@/components/ui/button";

interface Props {
  page: number; // 1-indexado
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  mobileStacked?: boolean;
}

export function Pagination({
  page,
  totalItems,
  pageSize,
  onPageChange,
  mobileStacked = false,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const inicio = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const fim = Math.min(page * pageSize, totalItems);

  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 border-t border-border px-4.5 py-2.5 text-xs text-muted-foreground ${mobileStacked ? "max-sm:flex-col max-sm:items-stretch" : ""}`}>
      <span>
        Mostrando {inicio}–{fim} de {totalItems}
      </span>
      <div className={`flex flex-wrap items-center gap-2 ${mobileStacked ? "max-sm:grid max-sm:grid-cols-[1fr_auto_1fr]" : ""}`}>
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Página anterior"
          className={mobileStacked ? "max-sm:min-h-11 max-sm:px-2" : undefined}
        >
          {mobileStacked ? <><span className="sm:hidden">‹</span><span className="hidden sm:inline">‹ Anterior</span></> : "‹ Anterior"}
        </Button>
        <span>
          Página {page} de {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Próxima página"
          className={mobileStacked ? "max-sm:min-h-11 max-sm:px-2" : undefined}
        >
          {mobileStacked ? <><span className="sm:hidden">›</span><span className="hidden sm:inline">Próxima ›</span></> : "Próxima ›"}
        </Button>
      </div>
    </div>
  );
}
