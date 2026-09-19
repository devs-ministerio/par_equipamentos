/** Header CSRF (double-submit cookie, Bloco 1 do Plan Mode consolidação
 * 2026-09-17, backend/app/main.py::csrf_middleware) -- toda rota mutável
 * (POST/PUT/PATCH/DELETE, incluindo `/auth/refresh`/`/auth/logout`) exige
 * que o header `X-CSRF-Token` bata com o valor do cookie `sigeo_csrf`. O
 * cookie não é HttpOnly de propósito (precisa ser legível por JS aqui) --
 * `document.cookie` é a única forma de ler seu valor. Usado só por
 * `lib/http-client.ts` desde o Bloco 1 do Plan Mode frontend 2026-09-17
 * (cliente HTTP único compartilhado por `api.ts`/`convenios.ts`/
 * `monitoramento.ts` -- antes os 3 services importavam isso cada um por
 * conta própria). */
export function csrfHeaders(): Record<string, string> {
  if (typeof document === 'undefined') return {};
  const match = document.cookie.match(/(?:^|; )sigeo_csrf=([^;]*)/);
  const token = match ? decodeURIComponent(match[1]) : null;
  return token ? { 'X-CSRF-Token': token } : {};
}
