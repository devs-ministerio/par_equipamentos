import { cn } from "@/lib/utils";
import { CONTAINER_CLASS } from "@/lib/layout";

/** Rodapé discreto do app: identifica sistema e órgão responsável e fecha a
 * página visualmente. Sem links nem dado dinâmico -- é só moldura. */
export function AppFooter() {
  return (
    <footer className="mt-12 border-t border-border/70">
      <div
        className={cn(
          CONTAINER_CLASS,
          "flex flex-col gap-1 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between",
        )}
      >
        <p className="m-0">
          <span className="font-display font-semibold text-foreground">
            SIGEO
          </span>{" "}
          · Sistema de Gestão de Equipamentos em Oncologia
        </p>
        <p className="m-0">DECAN · Ministério da Saúde</p>
      </div>
    </footer>
  );
}
