import type { ReactNode } from "react";
import { LayoutDashboard } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/hooks/useAuthSession";
import { usePainelTecnico } from "@/hooks/use-painel-tecnico";

const ROTA_PAINEL = "/monitoramento-equipamentos/meu-painel";

/** Card do cabeçalho do Painel de gestão: quem está logado e o atalho para o painel individual. */
export function CardColaborador({
  semBotao = false,
  acao,
}: {
  semBotao?: boolean;
  /** Substitui o botão do painel (ex.: seletor de colaborador no painel da equipe). */
  acao?: ReactNode;
}) {
  const { usuarioAtual } = useAuthSession();
  const gestao =
    usuarioAtual?.role === "admin" || usuarioAtual?.role === "gestor";
  const visivel = usuarioAtual != null && usuarioAtual.role !== "leitor";
  const painel = usePainelTecnico(undefined, visivel && !gestao);
  if (!visivel || !usuarioAtual) return null;
  const ufs = painel.data?.ufs ?? [];
  return (
    <div className="flex min-w-56 flex-col justify-center gap-1.5 self-stretch rounded-2xl border border-border/80 bg-card px-4 py-2.5 shadow-[var(--shadow-soft)]">
      <p className="m-0 truncate text-center text-sm leading-tight font-semibold">
        {usuarioAtual.name}
      </p>
      <p className="m-0 text-center text-xs leading-tight text-muted-foreground">
        {gestao ? "Região: Todas" : `Região: ${ufs.join(", ") || "—"}`}
      </p>
      {acao}
      {!semBotao && !acao && (
        <Button asChild size="sm" className="mt-0.5 w-full">
          <Link to={ROTA_PAINEL}>
            <LayoutDashboard aria-hidden="true" />
            {gestao ? "Painéis da equipe" : "Meu painel"}
          </Link>
        </Button>
      )}
    </div>
  );
}
