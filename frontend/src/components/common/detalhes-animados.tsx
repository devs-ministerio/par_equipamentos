import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/** "Mais detalhes": o conteúdo abre e fecha com altura e opacidade animadas
 * (`animar-detalhes` em index.css, desligada com prefers-reduced-motion). O
 * conteúdo só fica montado enquanto aberto ou fechando. */
export function DetalhesAnimados({
  aberto,
  onAbertoChange,
  children,
  className,
}: {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Collapsible
      open={aberto}
      onOpenChange={onAbertoChange}
      className={className}
    >
      <CollapsibleTrigger className="group flex min-h-11 w-fit cursor-pointer items-center gap-1 rounded-sm text-xs font-bold text-primary transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {aberto ? "Menos detalhes" : "Mais detalhes"}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-3.5 transition-transform duration-200 motion-reduce:transition-none",
            aberto && "rotate-180",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="animar-detalhes overflow-hidden">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
