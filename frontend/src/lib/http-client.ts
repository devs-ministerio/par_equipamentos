import { z } from 'zod';
import { ApiError } from '@/lib/api-error';
import { csrfHeaders } from '@/lib/csrf';

/** Bloco 1 do Plan Mode frontend 2026-09-17 -- cliente HTTP único
 * compartilhado por `services/api.ts`/`services/convenios.ts`/
 * `services/monitoramento.ts`, que antes reimplementavam cada um seu
 * próprio `credentials:'include'`/CSRF/refresh/redirect/normalização de
 * erro (3 mutexes de refresh independentes: um 401 simultâneo em
 * services diferentes podia disparar mais de uma rotação de refresh
 * token e produzir logout/redirecionamento intermitente). Agora só existe
 * 1 mutex, 1 lugar que decide redirect e 1 lugar que normaliza erro --
 * cada service continua dono só do seu schema Zod por domínio. */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

/** Sessão via cookie HttpOnly (Plan Mode segurança 2026-09-16, Bloco 2) --
 * não há mais token em `localStorage` pra ler/guardar: o browser manda o
 * cookie sozinho em toda chamada com `credentials: 'include'`, e o backend
 * o seta em `/auth/login`/`/auth/refresh`. */

/** `detail` de 422 (`RequestValidationError`, ver backend/app/errors.py) vem
 * como ARRAY de `{loc, msg, type}` -- diferente de `detail` de erro de
 * domínio (string simples). Achado na auditoria visual do Plan Mode
 * frontend 2026-09-17 (P0 #10): tratar `detail` sempre como string fazia
 * o array virar literalmente "[object Object]" na UI (coerção implícita
 * pra string). Junta as mensagens de cada campo quando é array; usa a
 * string direto nos demais casos. */
async function mensagemErroHttp(resp: Response): Promise<string> {
  try {
    const body = (await resp.json()) as { detail?: unknown; error?: string };
    if (Array.isArray(body.detail)) {
      const msgs = body.detail
        .map((d) => (d && typeof d === 'object' && 'msg' in d ? String((d as { msg: unknown }).msg) : null))
        .filter((m): m is string => Boolean(m));
      if (msgs.length) return msgs.join('; ');
    } else if (typeof body.detail === 'string' && body.detail) {
      return body.detail;
    }
    return body.error ?? `HTTP ${resp.status}`;
  } catch {
    return `HTTP ${resp.status}`;
  }
}

/** Dedup de refresh concorrente -- se várias chamadas em paralelo levam
 * 401 ao mesmo tempo (ex. página que dispara 3 queries juntas, ou 2
 * services diferentes na mesma tela), só a primeira dispara
 * `POST /auth/refresh`; as demais aguardam essa mesma promise em vez de
 * cada uma rotacionar o refresh token por conta própria (rotação real
 * invalida o anterior -- disparar 2 em paralelo faria a segunda falhar
 * por reuso do token já rotacionado pela primeira). Módulo único
 * (singleton) -- é o que faz o mutex valer entre `api.ts`/`convenios.ts`/
 * `monitoramento.ts` ao mesmo tempo, não só dentro de cada um. */
let renovacaoEmAndamento: Promise<boolean> | null = null;

function tentarRenovarSessao(): Promise<boolean> {
  if (!renovacaoEmAndamento) {
    renovacaoEmAndamento = fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: csrfHeaders(),
    })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        renovacaoEmAndamento = null;
      });
  }
  return renovacaoEmAndamento;
}

/** Rotas de autenticação nunca disparam a tentativa de renovação --
 * evita loop óbvio (401 em /auth/refresh tentando renovar via
 * /auth/refresh). */
const ROTAS_SEM_RENOVACAO = new Set(['/auth/login', '/auth/refresh', '/auth/logout']);

export interface RequisitarOpts {
  /** Redireciona pra /login em 401 definitivo (default true).
   * `fetchCurrentUser` (`GET /auth/me`) passa `false`: essa chamada roda
   * em toda página (inclusive públicas, ex. header) só pra saber "está
   * logado?", e 401 ali é um estado normal de visitante anônimo, não uma
   * sessão que expirou no meio de uma tela protegida. */
  redirecionarEm401?: boolean;
}

/** Núcleo comum a GET/POST/PATCH/DELETE de toda chamada HTTP autenticada
 * da aplicação: monta a URL, chama `fetch` sempre com
 * `credentials: 'include'` (manda/recebe o cookie de sessão), anexa
 * `X-CSRF-Token` em qualquer mutação (exceto `/auth/login`, que ainda não
 * tem sessão pra ter cookie CSRF), tenta renovar a sessão uma vez via
 * `/auth/refresh` em 401 e repete a chamada original antes de desistir,
 * e redireciona pra `/login` em 401 definitivo (a menos que
 * `redirecionarEm401: false`, ou já se esteja em `/login`). Nunca deixa
 * erro cru subir -- lança `ApiError` em qualquer falha (rede, HTTP). */
export async function httpFetch(path: string, init?: RequestInit, opts: RequisitarOpts = {}): Promise<Response> {
  const { redirecionarEm401 = true } = opts;
  const metodo = (init?.method ?? 'GET').toUpperCase();
  const precisaCsrf = metodo !== 'GET' && path !== '/auth/login';
  const executar = () =>
    fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: { ...init?.headers, ...(precisaCsrf ? csrfHeaders() : {}) },
    });

  let res: Response;
  try {
    res = await executar();
  } catch (e) {
    throw new ApiError(`Falha de rede ao consultar ${path}: ${(e as Error).message}`);
  }

  const podeRenovar = !ROTAS_SEM_RENOVACAO.has(path);
  if (res.status === 401 && podeRenovar) {
    const renovou = await tentarRenovarSessao();
    if (renovou) {
      try {
        res = await executar();
      } catch (e) {
        throw new ApiError(`Falha de rede ao consultar ${path}: ${(e as Error).message}`);
      }
    }
  }
  if (res.status === 401 && redirecionarEm401) {
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.assign('/login');
    }
  }
  return res;
}

/** `httpFetch` + validação de status/schema -- versão que a maioria dos
 * services usa (só as poucas chamadas que precisam do `Response` cru,
 * como upload/download binário, ficariam com `httpFetch` direto; nenhuma
 * existe hoje). */
export async function requisitar<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
  opts: RequisitarOpts = {},
): Promise<T> {
  const res = await httpFetch(path, init, opts);
  if (!res.ok) {
    // Resposta HTTP de domínio (4xx/5xx) -- o backend já garante que
    // `detail`/`error` não vaza detalhe técnico (Plan Mode segurança
    // 2026-09-16, Bloco 1), então essa mensagem é segura pro usuário.
    const mensagem = await mensagemErroHttp(res);
    throw new ApiError(mensagem, res.status, mensagem);
  }
  const json = res.status === 204 ? null : await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    // Nunca alcançou uma resposta de domínio de verdade -- `publicMessage`
    // fica no fallback genérico do `ApiError`, o detalhe do schema Zod só
    // vai pro `message` (log/console).
    throw new ApiError(`Resposta de ${path} não bate com o schema esperado: ${parsed.error.message}`);
  }
  return parsed.data;
}
