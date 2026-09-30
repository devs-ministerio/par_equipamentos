/** Navegação contextual compacta. Aba ativa usa sublinhado de accent, como
 * definido pela constituição, sem criar três cards dentro do cabeçalho. */
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const ITENS = [
  { path: "/dashboard", label: "Visão geral" },
  { path: "/mapa", label: "Mapa" },
  { path: "/relatorios", label: "Relatórios" },
];

export function NavBoxesAnaliseMerito() {
  const location = useLocation();
  return (
    <nav
      className="flex w-full flex-wrap gap-3 border-b border-border sm:w-auto sm:gap-5"
      aria-label="Seções da análise de mérito"
    >
      {ITENS.map((item) => {
        const ativo = location.pathname === item.path;
        return (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "-mb-px inline-flex min-h-11 items-center border-b-2 px-0.5 text-sm no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              ativo
                ? "border-primary font-semibold text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
