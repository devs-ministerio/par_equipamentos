import { z } from 'zod';
import { requisitar } from '@/lib/http-client';

const authUserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  role: z.enum(['admin', 'colaborador', 'leitor']),
  status: z.enum(['active', 'inactive', 'suspended']),
  created_at: z.string(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

const statusResponseSchema = z.object({ status: z.string() });

/** POST /auth/login -- o backend seta os cookies de sessão (access +
 * refresh + csrf) na própria resposta (Bloco 2); nada pra guardar em
 * `localStorage` aqui. O bearer fallback e o `access_token` no corpo
 * foram removidos em 2026-09-17 (Bloco 2 do Plan Mode consolidação). */
export async function login(email: string, password: string): Promise<void> {
  await requisitar('/auth/login', statusResponseSchema, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

/** POST /auth/logout -- revoga a sessão no servidor (Bloco 2), diferente
 * do comportamento antigo (só limpava o token no cliente, JWT continuava
 * válido até expirar). */
export async function logout(): Promise<void> {
  await requisitar('/auth/logout', statusResponseSchema, { method: 'POST' });
}

export async function ativarConta(token: string, password: string): Promise<void> {
  await requisitar('/auth/ativar', statusResponseSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) });
}

export async function solicitarRecuperacao(email: string): Promise<void> {
  await requisitar('/auth/esqueci-senha', statusResponseSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
}

export async function redefinirSenha(token: string, password: string): Promise<void> {
  await requisitar('/auth/redefinir-senha', statusResponseSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) });
}

export function fetchCurrentUser(): Promise<AuthUser> {
  // redirecionarEm401=false -- roda em toda página (inclusive públicas, ver
  // header) só pra checar sessão; 401 aqui é "visitante anônimo", estado
  // normal, não motivo pra redirect global (ver docstring de `requisitar`).
  return requisitar('/auth/me', authUserSchema, undefined, { redirecionarEm401: false });
}
