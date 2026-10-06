import { ClipboardList } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

/** Acesso independente das linhas de financiamento, também em celular. */
export function CentralEntradasLink() {
  const { pathname } = useLocation();
  return (
    <Button variant="ghost" size="icon" asChild>
      <Link
        to="/monitoramento-equipamentos/entradas"
        aria-label="Central de entradas"
        aria-current={pathname.endsWith("/entradas") ? "page" : undefined}
        title="Central de entradas"
      >
        <ClipboardList className="size-4.5" />
      </Link>
    </Button>
  );
}
