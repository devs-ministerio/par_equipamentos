import { z } from "zod";
import { apiAuthed, apiGetAuthed } from "./monitoramento-client";

// ---------------------------------------------------------------------
// Monitoramento -- ações
// ---------------------------------------------------------------------

const acaoMonitoramentoSchema = z.object({
  id: z.number(),
  instrumento_id: z.number(),
  nr_convenio: z.string(),
  descricao: z.string(),
  data_prevista: z.string().nullable(),
  data_conclusao: z.string().nullable(),
  // Legado texto livre -- leitura cai pra ele quando `responsavel_id` for
  // null (Plan Mode monitoramento-evolucao 2026-09-19).
  responsavel: z.string().nullable(),
  responsavel_id: z.number().nullable().optional(),
  responsavel_nome: z.string().nullable().optional(),
  criado_por_nome: z.string().nullable().optional(),
  created_at: z.string(),
  atualizado_em: z.string().nullable().optional(),
  substituido_por_id: z.number().nullable().optional(),
  deletado_em: z.string().nullable().optional(),
  deletado_por_nome: z.string().nullable().optional(),
  motivo_exclusao: z.string().nullable().optional(),
  ativo: z.boolean().optional().default(true),
});
export type AcaoMonitoramento = z.infer<typeof acaoMonitoramentoSchema>;

export function fetchAcoes(pendentes?: boolean): Promise<AcaoMonitoramento[]> {
  const query = pendentes ? "?pendentes=true" : "";
  return apiGetAuthed(
    `/monitoramento/acoes${query}`,
    z.array(acaoMonitoramentoSchema),
  );
}

const acoesDoInstrumentoSchema = z.object({
  data: z.array(acaoMonitoramentoSchema),
  meta: z.object({
    total: z.number().int().nonnegative(),
    abertas: z.number().int().nonnegative(),
    atrasadas: z.number().int().nonnegative(),
  }),
});
export type AcoesDoInstrumento = z.infer<typeof acoesDoInstrumentoSchema>;

/** Ações de UM instrumento, pendentes primeiro. `meta.total` conta além do teto da resposta; `abertas` e
 * `atrasadas` valem para o instrumento inteiro, com ou sem o filtro. */
export function fetchAcoesDoInstrumento(
  nrConvenio: string,
  pendentes = false,
): Promise<AcoesDoInstrumento> {
  const query = pendentes ? "?pendentes=true" : "";
  return apiGetAuthed(
    `/monitoramento/instrumentos/${encodeURIComponent(nrConvenio)}/acoes${query}`,
    acoesDoInstrumentoSchema,
  );
}

export interface CriarAcaoInput {
  descricao: string;
  data_prevista?: string | null;
  responsavel?: string | null;
  responsavel_id?: number | null;
}

export function criarAcao(
  nrConvenio: string,
  corpo: CriarAcaoInput,
): Promise<AcaoMonitoramento> {
  return apiAuthed(
    `/monitoramento/instrumentos/${nrConvenio}/acoes`,
    acaoMonitoramentoSchema,
    "POST",
    corpo,
  );
}

export function concluirAcao(acaoId: number): Promise<AcaoMonitoramento> {
  return apiAuthed(
    `/monitoramento/acoes/${acaoId}/concluir`,
    acaoMonitoramentoSchema,
    "PATCH",
  );
}

/** Corrigir (append-only, ver docstring do model no backend) -- lança uma
 * ação nova e fecha a antiga; nunca UPDATE. */
export interface EditarAcaoInput {
  descricao: string;
  data_prevista?: string | null;
  responsavel?: string | null;
  responsavel_id?: number | null;
}

export function editarAcao(
  acaoId: number,
  corpo: EditarAcaoInput,
): Promise<AcaoMonitoramento> {
  return apiAuthed(
    `/monitoramento/acoes/${acaoId}`,
    acaoMonitoramentoSchema,
    "PATCH",
    corpo,
  );
}

export function excluirAcao(
  acaoId: number,
  motivo: string,
): Promise<AcaoMonitoramento> {
  return apiAuthed(
    `/monitoramento/acoes/${acaoId}`,
    acaoMonitoramentoSchema,
    "DELETE",
    { motivo },
  );
}
