import { LayoutDashboard } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CONTAINER_CLASS } from "@/lib/layout";
import { useAuthSession } from "@/hooks/useAuthSession";
import { usePainelTecnico } from "@/hooks/use-painel-tecnico";

const ROTA_PAINEL = "/monitoramento-equipamentos/meu-painel";
const PAPEL: Record<string, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  colaborador: "Colaborador",
};

/** Faixa no cabeçalho do monitoramento: quem está logado e o atalho para o painel individual. */
export function CardColaborador() {
  const { usuarioAtual } = useAuthSession();
  const { pathname } = useLocation();
  const gestao =
    usuarioAtual?.role === "admin" || usuarioAtual?.role === "gestor";
  const visivel = usuarioAtual != null && usuarioAtual.role !== "leitor";
  const painel = usePainelTecnico(undefined, visivel && !gestao);
  if (!visivel || !usuarioAtual) return null;
  const ufs = painel.data?.ufs ?? [];
  const noPainel = pathname === ROTA_PAINEL;
  return (
    <div className="border-b border-border/70 bg-card/60">
      <div
        className={`${CONTAINER_CLASS} flex flex-wrap items-center justify-between gap-3 py-2.5`}
      >
        <Link to={ROTA_PAINEL} className="min-w-0 hover:underline">
          <p className="m-0 truncate text-sm font-semibold">
            {usuarioAtual.name}
          </p>
          <p className="m-0 text-xs text-muted-foreground">
            {PAPEL[usuarioAtual.role] ?? usuarioAtual.role}
            {!gestao && ufs.length > 0 && ` · ${ufs.join(", ")}`}
          </p>
        </Link>
        <Button asChild size="sm" variant={noPainel ? "secondary" : "default"}>
          <Link to={ROTA_PAINEL}>
            <LayoutDashboard aria-hidden="true" />
            Painel de gestão
          </Link>
        </Button>
      </div>
    </div>
  );
}
