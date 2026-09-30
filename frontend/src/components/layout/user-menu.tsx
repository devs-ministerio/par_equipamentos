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

export function UserMenu({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
} = {}) {
  const sessao = useAuthSession();
  const navigate = useNavigate();
  const location = useLocation();

  function sairDaSessao() {
    void sessao.sair();
    navigate("/login", { replace: true });
    onNavigate?.();
  }

  function abrirUsuarios() {
    navigate("/admin/usuarios");
    onNavigate?.();
  }

  function abrirLogin() {
    navigate("/login", { state: { from: location.pathname } });
    onNavigate?.();
  }

  if (sessao.checandoSessao) return null;

  if (!sessao.autenticado) {
    if (mobile) {
      return (
        <div className="px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Conta
          </p>
          <Button
            variant="outline"
            className="mt-3 min-h-11 w-full justify-start"
            onClick={abrirLogin}
          >
            Entrar
          </Button>
        </div>
      );
    }
    return (
      <Button size="sm" variant="outline" onClick={abrirLogin}>
        Login
      </Button>
    );
  }

  if (mobile) {
    return (
      <div className="px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Conta
        </p>
        <p className="mt-2 truncate text-sm font-semibold text-foreground">
          {sessao.usuarioAtual?.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {sessao.usuarioAtual?.role === "admin"
            ? "Administrador"
            : sessao.usuarioAtual?.role === "gestor"
              ? "Gestor"
              : sessao.usuarioAtual?.role === "colaborador"
                ? "Colaborador"
                : "Leitor"}
        </p>
        <div className="mt-3 flex flex-col gap-1">
          {sessao.usuarioAtual?.role === "admin" && (
            <Button
              variant="ghost"
              className="min-h-11 w-full justify-start px-3"
              onClick={abrirUsuarios}
            >
              Usuários
            </Button>
          )}
          <Button
            variant="ghost"
            className="min-h-11 w-full justify-start px-3 text-destructive hover:text-destructive"
            onClick={sairDaSessao}
          >
            Sair
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs text-muted-foreground sm:inline">
        {sessao.usuarioAtual?.name}
        {!sessao.podeEditar && " · leitor"}
      </span>
      {sessao.usuarioAtual?.role === "admin" && (
        <>
          <Button size="sm" variant="ghost" onClick={abrirUsuarios}>
            Usuários
          </Button>
        </>
      )}
      <Button size="sm" variant="ghost" onClick={sairDaSessao}>
        Sair
      </Button>
    </div>
  );
}
