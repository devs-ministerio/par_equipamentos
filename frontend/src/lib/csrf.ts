/** Header CSRF (double-submit cookie, Bloco 1 do Plan Mode consolidação
 * 2026-09-17, backend/app/main.py::csrf_middleware) -- toda rota mutável
 * (POST/PUT/PATCH/DELETE, incluindo `/auth/refresh`/`/auth/logout`) exige
 * que o header `X-CSRF-Token` bata com o valor do cookie `sigeo_csrf`. O
 * cookie não é HttpOnly de propósito (precisa ser legível por JS aqui) --
 * `document.cookie` é a única forma de ler seu valor. Compartilhado pelos
 * 3 clientes HTTP (`api.ts`/`convenios.ts`/`monitoramento.ts`) porque
 * nenhum deles importa do outro (ver docstring de `tentarRenovarSessao`
 * duplicada nos 3). */
export function csrfHeaders(): Record<string, string> {
  if (typeof document === 'undefined') return {};
  const match = document.cookie.match(/(?:^|; )sigeo_csrf=([^;]*)/);
  const token = match ? decodeURIComponent(match[1]) : null;
  return token ? { 'X-CSRF-Token': token } : {};
}
