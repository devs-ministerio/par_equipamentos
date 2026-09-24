import { z } from "zod";
import { apiAuthed, apiGetAuthed } from "./monitoramento-client";

// ---------------------------------------------------------------------
// Gestão de usuários (Módulo Admin, backend/app/routers/usuarios.py) --
// mesmo formato snake_case dos demais services de monitoramento (ver
// docstring de monitoramento-client.ts).
// ---------------------------------------------------------------------

export const userRoleSchema = z.enum(["admin", "colaborador", "leitor"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const userStatusSchema = z.enum(["active", "inactive", "suspended"]);
export type UserStatus = z.infer<typeof userStatusSchema>;

const userSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  role: userRoleSchema,
  status: userStatusSchema,
  created_at: z.string(),
});
export type Usuario = z.infer<typeof userSchema>;

const userListSchema = z.object({
  itens: z.array(userSchema),
  total: z.number(),
});
export type UsuarioLista = z.infer<typeof userListSchema>;

export interface FiltroUsuarios {
  limit?: number;
  offset?: number;
  busca?: string;
  role?: UserRole;
  status?: UserStatus;
}

export function fetchUsuarios(
  filtro: FiltroUsuarios = {},
): Promise<UsuarioLista> {
  const params = new URLSearchParams();
  if (filtro.limit) params.set("limit", String(filtro.limit));
  if (filtro.offset) params.set("offset", String(filtro.offset));
  if (filtro.busca) params.set("busca", filtro.busca);
  if (filtro.role) params.set("role", filtro.role);
  if (filtro.status) params.set("status", filtro.status);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiGetAuthed(`/usuarios${query}`, userListSchema);
}

export interface CriarUsuarioInput {
  name: string;
  email: string;
  role: UserRole;
}

export function criarUsuario(corpo: CriarUsuarioInput): Promise<Usuario> {
  return apiAuthed("/usuarios", userSchema, "POST", corpo);
}

export interface AtualizarUsuarioInput {
  name: string;
  role: UserRole;
}

export function atualizarUsuario(
  userId: number,
  corpo: AtualizarUsuarioInput,
): Promise<Usuario> {
  return apiAuthed(`/usuarios/${userId}`, userSchema, "PATCH", corpo);
}

/** Solicita link de redefinição por e-mail; nenhuma senha transita pela API
 * ou pela interface administrativa. */
export function enviarRedefinicaoUsuario(userId: number): Promise<Usuario> {
  return apiAuthed(
    `/usuarios/${userId}/enviar-redefinicao`,
    userSchema,
    "POST",
  );
}

export function inativarUsuario(userId: number): Promise<Usuario> {
  return apiAuthed(`/usuarios/${userId}/inativar`, userSchema, "POST");
}

export function reativarUsuario(userId: number): Promise<Usuario> {
  return apiAuthed(`/usuarios/${userId}/reativar`, userSchema, "POST");
}
