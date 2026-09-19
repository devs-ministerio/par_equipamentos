import type { ReactNode } from 'react';
import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';

/** Cabeçalho de tabela ordenável (Seção 15 da constituição -- navegação por
 * teclado, `aria-sort`). Antes era `<span onClick>`/`<TableHead onClick>`
 * sem semântica nenhuma (achado transversal #8 do diagnóstico) -- agora é
 * um `<button>` de verdade dentro do `<th>`, com `aria-sort` refletindo o
 * estado atual. `extra` é um slot pro que não faz parte da ordenação (ex.
 * `InfoIcon`), fica fora do botão mas dentro do mesmo `<th>`. */
export function SortableTableHead({
  ativo,
  direcao,
  onToggle,
  children,
  extra,
  className,
  align = 'left',
}: {
  ativo: boolean;
  direcao: 'asc' | 'desc';
  onToggle: () => void;
  children: ReactNode;
  extra?: ReactNode;
  className?: string;
  align?: 'left' | 'right';
}) {
  return (
    <TableHead
      className={className}
      aria-sort={ativo ? (direcao === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className={cn('flex items-center gap-1', align === 'right' && 'justify-end')}>
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex cursor-pointer items-center gap-[3px] rounded-sm text-left font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {children}
          {ativo && <span aria-hidden="true">{direcao === 'asc' ? '▲' : '▼'}</span>}
        </button>
        {extra}
      </span>
    </TableHead>
  );
}
