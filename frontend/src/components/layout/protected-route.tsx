/** Gate de rota autenticada -- Plan Mode segurança 2026-09-16, Bloco 1: as
 * leituras do monitoramento interno (instrumentos, timeline, resumo, ações,
 * propostas candidatas) passaram a exigir sessão no backend. Sem este gate
 * o usuário via a página inteira renderizar e só falhava nas chamadas de
 * API (redirect reativo em `requisitar`, ver services/monitoramento.ts) --
 * pior UX que negar a rota de cara quando não há token nenhum.
 *
 * Só bloqueia pela AUSÊNCIA de token (checagem síncrona, sem esperar
 * `/auth/me`) -- um token presente mas inválido/expirado ainda deixa a
 * página montar; a chamada de API que falhar em seguida já redireciona via
 * `requisitar`. Isso evita duplicar aqui a lógica de "sessão válida" que já
 * vive em `useAuthSession`. */
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getAuthToken } from '@/services/monitoramento';

export function ProtectedRoute() {
  const location = useLocation();
  const token = getAuthToken();

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
