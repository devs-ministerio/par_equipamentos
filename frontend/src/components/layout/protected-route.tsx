/** Gate de rota autenticada -- Plan Mode segurança 2026-09-16, Bloco 1/2:
 * as leituras do monitoramento interno (instrumentos, timeline, resumo,
 * ações, propostas candidatas) exigem sessão no backend, e a sessão em si
 * é um cookie HttpOnly (Bloco 2) -- JS não consegue ler o cookie
 * sincronamente, então "há sessão?" só se sabe perguntando ao backend
 * (`useAuthSession`, via `GET /auth/me`). Enquanto essa checagem está em
 * voo, mostra um estado de carregamento em vez de já cravar autenticado ou
 * redirecionar -- sem isso a rota piscaria pra /login a cada refresh de
 * página, mesmo com sessão válida. */
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthSession } from '@/hooks/useAuthSession';
import { ErrorAlert } from '@/components/common/error-alert';

export function ProtectedRoute() {
  const location = useLocation();
  const sessao = useAuthSession();

  if (sessao.checandoSessao) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-6 text-center text-sm text-muted-foreground" role="status">
        Verificando sessão…
      </main>
    );
  }

  if (sessao.erroSessao) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-6">
        <div className="w-full max-w-md">
          <ErrorAlert
            mensagem="Não foi possível verificar a sessão. Confirme se a API está acessível e tente novamente."
            onRetry={() => { void sessao.tentarNovamenteSessao(); }}
          />
        </div>
      </main>
    );
  }

  if (!sessao.autenticado) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
