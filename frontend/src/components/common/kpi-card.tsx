import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** 4 valores cobrem todo uso real hoje (grep de import em src/, 2026-09-10):
 * `primary` (neutro, maioria dos KPIs informativos), `destructive`
 * (KPI de "hipossuficiente" -- antes usava hex `#a32d2d`, ligeiramente
 * diferente de --destructive/#B40D0D; migrado pro token, consolidação
 * visual intencional), `success`/`warning` (KPIs de Monitoramento que
 * usavam colors.hiperGreen/colors.logoOrange direto). Não é exclusivo do
 * dashboard -- também usado em Monitoramento*Page.tsx, por isso mora em
 * components/common/ (ver CLAUDE.md, seção "Estrutura de pastas do
 * frontend"). */
export type KpiCardVariant = 'primary' | 'destructive' | 'success' | 'warning';

const VARIANT_TEXT: Record<KpiCardVariant, string> = {
  primary: 'text-foreground',
  destructive: 'text-destructive',
  success: 'text-success',
  warning: 'text-warning-foreground',
};

const VARIANT_ACTIVE_RING: Record<KpiCardVariant, string> = {
  primary: 'border-foreground/50 ring-3 ring-foreground/10',
  destructive: 'border-destructive/50 ring-3 ring-destructive/15',
  success: 'border-success/50 ring-3 ring-success/15',
  warning: 'border-warning/50 ring-3 ring-warning/15',
};

export function KpiCard({
  label,
  value,
  variant = 'primary',
  info,
  onClick,
  ativo,
}: {
  label: string;
  value: string | number;
  variant?: KpiCardVariant;
  info?: ReactNode;
  /** Quando presente, o card vira clicável (cursor, hover, destaque). */
  onClick?: () => void;
  /** Destaca visualmente o card quando o filtro que ele aciona já está ativo. */
  ativo?: boolean;
}) {
  const Tag = onClick ? 'button' : 'div';

  // Card do shadcn (components/ui/card.tsx) não suporta `asChild` (só
  // Button/Badge, via Slot do radix-ui) -- precisamos de <button> quando
  // clicável (acessibilidade real: type="button" + aria-pressed, não um
  // <div> com onClick), então aplicamos as mesmas classes visuais do Card
  // direto no Tag em vez de compor com o componente.
  return (
    <Tag
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      aria-pressed={onClick ? ativo : undefined}
      className={cn(
        // Card estatico so com borda (Secao 5: sombra reservada a overlay,
        // ver ui/card.tsx) -- ring-1 antigo tirado de proposito.
        'flex min-h-[69px] min-w-[180px] flex-1 flex-col items-center justify-center gap-0 rounded-xl border border-border bg-card p-4 text-center text-card-foreground',
        onClick && 'cursor-pointer',
        ativo && VARIANT_ACTIVE_RING[variant],
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
        {info}
      </div>
      <div className={cn('mt-1.5 font-display text-xl font-semibold', VARIANT_TEXT[variant])}>{value}</div>
    </Tag>
  );
}
