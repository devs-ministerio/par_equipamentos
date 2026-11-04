import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const BASE = "rounded-[5px] px-[9px] py-0.5 font-mono text-[11.5px] font-bold";

/** Selo do tipo de contratação (FAF, TED...). */
export function ChipTipo({ children }: { children: ReactNode }) {
  return (
    <span className={cn(BASE, "bg-primary text-primary-foreground")}>
      {children}
    </span>
  );
}

/** Identificador rotulado, no mesmo formato do ano: texto mono discreto. */
export function ChipIdentificador({
  rotulo,
  children,
}: {
  rotulo: string;
  children: ReactNode;
}) {
  return (
    <span className="font-mono text-[11.5px] text-muted-foreground">
      {rotulo} {children}
    </span>
  );
}
