import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type MetricVariant = 'primary' | 'destructive' | 'success' | 'warning';

export interface MetricStripItem {
  key: string;
  label: string;
  value: string | number;
  variant?: MetricVariant;
  info?: ReactNode;
  onClick?: () => void;
  ativo?: boolean;
}

/** Faixa editorial de métricas com um único contorno para o grupo. */
export function MetricStrip({ items }: { items: MetricStripItem[] }) {
  return (
    <div className="grid overflow-hidden rounded-xl border border-border bg-card [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
      {items.map((item, index) => {
        const Tag = item.onClick ? 'button' : 'div';
        return (
          <Tag
            key={item.key}
            type={item.onClick ? 'button' : undefined}
            onClick={item.onClick}
            aria-pressed={item.onClick ? item.ativo : undefined}
            className={cn(
              'relative min-h-20 border-border px-4 py-3 text-left transition-colors',
              index > 0 && 'border-t sm:border-l sm:border-t-0',
              item.onClick && 'cursor-pointer hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
              item.ativo && 'bg-secondary',
            )}
          >
            {item.ativo && <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" aria-hidden="true" />}
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              {item.label}{item.info}
            </div>
            <div className={cn(
              'mt-2 font-display text-xl font-semibold text-foreground',
              item.variant === 'destructive' && 'text-destructive',
              item.variant === 'success' && 'text-success',
              item.variant === 'warning' && 'text-warning',
            )}>{item.value}</div>
          </Tag>
        );
      })}
    </div>
  );
}
