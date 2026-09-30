import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Cabeçalho editorial único: hierarquia por tipografia e divisor, sem
 * transformar a introdução de toda página em um card/hero decorativo. */
export function PageHeader({
  breadcrumb,
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  breadcrumb?: ReactNode;
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "relative mb-6 border-b border-border pb-5 pl-4 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-primary",
        className,
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          {breadcrumb && (
            <div className="mb-1.5 text-xs text-muted-foreground">
              {breadcrumb}
            </div>
          )}
          <div className="mb-1.5 text-[10px] font-bold tracking-[0.1em] text-primary uppercase">
            {eyebrow}
          </div>
          <h1 className="m-0 font-display text-2xl leading-tight font-bold tracking-[-0.035em] text-foreground sm:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions}
      </div>
    </header>
  );
}
