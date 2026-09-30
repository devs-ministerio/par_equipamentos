import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type MetricVariant = "primary" | "destructive" | "success" | "warning";

export interface MetricStripItem {
  key: string;
  label: string;
  value: string | number;
  variant?: MetricVariant;
  info?: ReactNode;
  detail?: ReactNode;
  onClick?: () => void;
  ativo?: boolean;
  mobileFullWidth?: boolean;
}

/** Faixa editorial de métricas com um único contorno para o grupo. */
export function MetricStrip({
  items,
  compactMobile = false,
  desktopColumns = 5,
}: {
  items: MetricStripItem[];
  compactMobile?: boolean;
  desktopColumns?: 5 | 6;
}) {
  return (
    <div
      className={cn(
        "grid overflow-hidden rounded-xl border border-border",
        compactMobile
          ? cn(
              "grid-cols-1 gap-px bg-border min-[375px]:grid-cols-2 sm:grid-cols-3",
              desktopColumns === 6 ? "lg:grid-cols-6" : "lg:grid-cols-5",
            )
          : "bg-card [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]",
      )}
    >
      {items.map((item, index) => {
        const Tag = item.onClick ? "button" : "div";
        return (
          <Tag
            key={item.key}
            type={item.onClick ? "button" : undefined}
            onClick={item.onClick}
            aria-pressed={item.onClick ? item.ativo : undefined}
            className={cn(
              "relative min-h-20 min-w-0 px-4 py-3 text-left transition-colors",
              compactMobile
                ? cn(
                    "bg-card",
                    item.mobileFullWidth && "min-[375px]:col-span-2 sm:col-span-1",
                    index === items.length - 1 &&
                      items.length % 2 === 1 &&
                      "min-[375px]:col-span-2 lg:col-span-1",
                  )
                : cn(
                    "border-border",
                    index > 0 && "border-t sm:border-l sm:border-t-0",
                  ),
              item.onClick &&
                "cursor-pointer hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
              item.ativo && "bg-secondary",
            )}
          >
            {item.ativo && (
              <span
                className="absolute inset-y-0 left-0 w-[3px] bg-primary"
                aria-hidden="true"
              />
            )}
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              {item.label}
              {item.info}
            </div>
            <div
              className={cn(
                "mt-2 break-words font-display text-xl font-semibold tabular-nums text-foreground",
                compactMobile && "max-sm:text-lg",
                item.variant === "destructive" && "text-destructive",
                item.variant === "success" && "text-success",
                item.variant === "warning" && "text-warning",
              )}
            >
              {item.value}
            </div>
            {item.detail && (
              <div className="mt-1 text-xs leading-snug text-muted-foreground">
                {item.detail}
              </div>
            )}
          </Tag>
        );
      })}
    </div>
  );
}
