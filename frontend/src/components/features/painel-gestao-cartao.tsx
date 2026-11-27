import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Cartão de dashboard do Painel de gestão, no mesmo padrão do Meu painel. */
export function PainelCartao({
  titulo,
  apoio,
  children,
  className,
}: {
  titulo: string;
  apoio?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex h-full min-w-0 flex-col rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h3 className="m-0 text-base font-semibold tracking-tight">{titulo}</h3>
        {apoio && (
          <p className="m-0 text-sm tabular-nums text-muted-foreground">
            {apoio}
          </p>
        )}
      </div>
      <div className="mt-5 flex flex-1 flex-col">{children}</div>
    </section>
  );
}
