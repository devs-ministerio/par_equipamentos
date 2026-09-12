/** Base da API do backend (nao dos JSON estaticos de public/, ver
 * useJson.ts) -- so o monitoramento interno pos-repasse fala com isso, e a
 * lista leve de instrumentos monitorados usada na pagina principal pra
 * destacar o card certo sem abrir um por um. */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

const AUTH_TOKEN_STORAGE_KEY = 'sieo.authToken';

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'colaborador' | 'leitor';
  status: 'active' | 'inactive' | 'suspended';
  created_at: string;
};

export function getAuthToken(): string | null {
  return typeof window === 'undefined' ? null : window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

export function setAuthToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  else window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

export function authHeaders(): HeadersInit {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function login(email: string, password: string): Promise<string> {
  const resp = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!resp.ok) throw new Error(await mensagemErroApi(resp));
  const body = (await resp.json()) as { access_token: string };
  setAuthToken(body.access_token);
  return body.access_token;
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const resp = await fetch(`${API_BASE_URL}/auth/me`, { headers: authHeaders() });
  if (!resp.ok) throw new Error(await mensagemErroApi(resp));
  return resp.json() as Promise<AuthUser>;
}

export async function mensagemErroApi(resp: Response): Promise<string> {
  try {
    const body = (await resp.json()) as { detail?: string; error?: string };
    return body.detail ?? body.error ?? `HTTP ${resp.status}`;
  } catch {
    return `HTTP ${resp.status}`;
  }
}

export async function assertRespostaOk(resp: Response): Promise<void> {
  if (resp.status === 401) setAuthToken(null);
  if (!resp.ok) throw new Error(await mensagemErroApi(resp));
}
