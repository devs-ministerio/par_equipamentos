import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Estado vazio padrão -- mensagem + CTA opcional (Seção 12 da
 * constituição). Usar em qualquer lista/tabela/busca sem resultado, no
 * lugar de um `<p>` solto por tela. */
export function EmptyState({
  titulo,
  descricao,
  acao,
  className,
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-12 text-center', className)}>
      <div>
        <p className="text-sm font-semibold text-foreground">{titulo}</p>
        {descricao && <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{descricao}</p>}
      </div>
      {acao}
    </div>
  );
}
