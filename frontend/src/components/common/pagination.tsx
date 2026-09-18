import { Button } from '@/components/ui/button';

interface Props {
  page: number; // 1-indexado
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalItems, pageSize, onPageChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const inicio = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const fim = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between border-t border-border px-4.5 py-2.5 text-xs text-muted-foreground">
      <span>
        Mostrando {inicio}–{fim} de {totalItems}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          ‹ Anterior
        </Button>
        <span>
          Página {page} de {totalPages}
        </span>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Próxima ›
        </Button>
      </div>
    </div>
  );
}
