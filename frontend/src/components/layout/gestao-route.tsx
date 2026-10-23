/** Gate das telas de gestão (gestor ou administrador); a API aplica a mesma regra. */
import { Navigate, Outlet } from "react-router-dom";
import { useAuthSession } from "@/hooks/useAuthSession";
import { ErrorAlert } from "@/components/common/error-alert";

export function GestaoRoute() {
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
  const papel = sessao.usuarioAtual?.role;
  if (papel !== "admin" && papel !== "gestor") {
    return <Navigate to="/monitoramento-equipamentos" replace />;
  }
  return <Outlet />;
}
