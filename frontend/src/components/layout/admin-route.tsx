/** Gate do módulo de gestão de usuários -- mesmo padrão de
 * `protected-route.tsx`, mas checa `role === 'admin'` (gate real, não só
 * o binário leitor/resto do resto do app -- ver `require_admin_user` no
 * backend). Composto DENTRO de `ProtectedRoute` em App.tsx: sessão
 * primeiro, papel depois. Ocultar o link no menu (UserMenu) é conveniência
 * de UI, não controle de acesso -- quem digita a URL direto sem ser admin
 * ainda precisa cair aqui. */
import { Navigate, Outlet } from "react-router-dom";
import { useAuthSession } from "@/hooks/useAuthSession";
import { ErrorAlert } from "@/components/common/error-alert";

export function AdminRoute() {
  const sessao = useAuthSession();

  if (sessao.checandoSessao) {
    return (
      <main
        className="grid min-h-screen place-items-center bg-background px-6 text-center text-sm text-muted-foreground"
        role="status"
      >
        Verificando sessão…
      </main>
    );
  }

  if (sessao.erroSessao) {
    return (
      <ErrorAlert
        mensagem="Não foi possível verificar a sessão."
        onRetry={() => {
          void sessao.tentarNovamenteSessao();
        }}
      />
    );
  }

  if (sessao.usuarioAtual?.role !== "admin") {
    return <Navigate to="/monitoramento-equipamentos" replace />;
  }

  return <Outlet />;
}
