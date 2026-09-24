/** Widget de sessão no header -- "Login" (leva pra /login) ou nome+"Sair"
 * quando autenticado. Fica dentro do AppHeader (achado 2026-09-15, pedido
 * do usuário: "coloquei botões de login em todas as páginas no nav" --
 * como AppHeader é usado por TODA página do app -- PainelGeralPage,
 * AppLayout, MonitoramentoLayout --, bastou 1 lugar só). Login deixou de
 * abrir inline dentro do card de convênio (MonitoramentoInternoAcesso
 * agora só linka pra /login, ver docstring lá) -- pedido do usuário:
 * "preciso que o botão de login aponte para uma página de login". */
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthSession } from "@/hooks/useAuthSession";
import { Button } from "@/components/ui/button";

export function UserMenu() {
  const sessao = useAuthSession();
  const navigate = useNavigate();
  const location = useLocation();

  function sairDaSessao() {
    void sessao.sair();
    navigate("/login", { replace: true });
  }

  if (sessao.checandoSessao) return null;

  if (!sessao.autenticado) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          navigate("/login", { state: { from: location.pathname } })
        }
      >
        Login
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs text-muted-foreground sm:inline">
        {sessao.usuarioAtual?.name}
        {!sessao.podeEditar && " · leitor"}
      </span>
      {sessao.usuarioAtual?.role === "admin" && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate("/admin/usuarios")}
        >
          Usuários
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={sairDaSessao}>
        Sair
      </Button>
    </div>
  );
}
