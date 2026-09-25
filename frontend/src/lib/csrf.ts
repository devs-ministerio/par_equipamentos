/** Header CSRF (double-submit cookie, Bloco 1 do Plan Mode consolidação
 * 2026-09-17, backend/app/main.py::csrf_middleware) -- toda rota mutável
 * (POST/PUT/PATCH/DELETE, incluindo `/auth/refresh`/`/auth/logout`) exige
 * que o header `X-CSRF-Token` bata com o valor do cookie `sigeo_csrf`. O
 * cookie não é HttpOnly de propósito. Em host único o JS o lê por
 * `document.cookie`; entre Vercel e Render, o cliente recupera a cópia pela
 * rota CORS protegida `/auth/csrf` e a mantém só em memória. Usado só por
 * `lib/http-client.ts` desde o Bloco 1 do Plan Mode frontend 2026-09-17
 * (cliente HTTP único compartilhado por `api.ts`/`convenios.ts`/
 * `monitoramento.ts` -- antes os 3 services importavam isso cada um por
 * conta própria). */
let csrfTokenEmMemoria: string | null = null;

function csrfTokenDoCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )sigeo_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Registra o token devolvido pela API. Em produção o cookie da API não é
 * visível em `document.cookie` do Vercel; o token continua em memória e é
 * renovado no login, refresh ou GET /auth/csrf. */
export function atualizarCsrfToken(token: string | null): void {
  csrfTokenEmMemoria = token;
}

export function limparCsrfToken(): void {
  csrfTokenEmMemoria = null;
}

export function csrfHeaders(): Record<string, string> {
  const token = csrfTokenDoCookie() ?? csrfTokenEmMemoria;
  return token ? { "X-CSRF-Token": token } : {};
}
