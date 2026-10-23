import { z } from "zod";
import { apiAuthed, apiGetAuthed } from "./monitoramento-client";

// ---------------------------------------------------------------------
// Itens, entregas e unidades de equipamento (backend/app/routers/entregas.py)
// ---------------------------------------------------------------------

const unidadeSchema = z.object({
  id: z.number(),
  entrega_id: z.number(),
  item_id: z.number(),
  ordem: z.number(),
  marca: z.string().nullable(),
  modelo: z.string().nullable(),
  numero_serie: z.string().nullable(),
  vida_util_anos: z.number().nullable(),
  data_entrega: z.string(),
});
export type UnidadeEquipamento = z.infer<typeof unidadeSchema>;

const itemSchema = z.object({
  id: z.number(),
  codigo_item: z.string().nullable(),
  descricao: z.string(),
  familia: z.string().nullable(),
  controla_unidade: z.boolean(),
  quantidade_planejada: z.number().nullable(),
  quantidade_entregue: z.number(),
  situacao: z.enum(["pendente", "parcial", "entregue", "legado_a_revisar"]),
  ultima_entrega: z.string().nullable(),
  unidades: z.array(unidadeSchema),
});
export type ItemEquipamento = z.infer<typeof itemSchema>;

const equipamentosSchema = z.object({
  nr_convenio: z.string(),
  pode_editar: z.boolean(),
  itens: z.array(itemSchema),
  outros_itens: z.number(),
  revisoes_pendentes: z.number(),
});
export type EquipamentosInstrumento = z.infer<typeof equipamentosSchema>;

const entregaSchema = z.object({
  id: z.number(),
  instrumento_id: z.number(),
  evento_id: z.number().nullable(),
  data_ocorrencia: z.string(),
  observacao: z.string().nullable(),
  unidades: z.array(unidadeSchema),
});
export type EntregaEquipamento = z.infer<typeof entregaSchema>;

const entregaLegadaSchema = z.object({
  id: z.number(),
  nr_convenio: z.string(),
  evento_id: z.number(),
  data_ocorrencia: z.string().nullable(),
  motivo: z.string(),
  criado_em: z.string(),
});
export type EntregaLegada = z.infer<typeof entregaLegadaSchema>;

export interface UnidadeEntregaInput {
  marca: string | null;
  modelo: string | null;
  numero_serie: string | null;
  vida_util_anos: number | null;
}

export interface ItemEntregaInput {
  item_id: number;
  unidades: UnidadeEntregaInput[];
  confirmar_quantidade_desconhecida?: boolean;
}

export interface RegistrarEntregaInput {
  chave_idempotencia: string;
  data_ocorrencia: string;
  observacao?: string | null;
  itens: ItemEntregaInput[];
}

export interface CorrigirUnidadeInput {
  marca?: string | null;
  modelo?: string | null;
  numero_serie?: string | null;
  vida_util_anos?: number | null;
}

export function fetchEquipamentos(
  nr: string,
): Promise<EquipamentosInstrumento> {
  return apiGetAuthed(
    `/monitoramento/instrumentos/${encodeURIComponent(nr)}/equipamentos`,
    equipamentosSchema,
  );
}

export function fetchEntregasLegadas(): Promise<EntregaLegada[]> {
  return apiGetAuthed(
    "/monitoramento/entregas-legadas",
    z.array(entregaLegadaSchema),
  );
}

export function registrarEntrega(
  nr: string,
  corpo: RegistrarEntregaInput,
): Promise<EntregaEquipamento> {
  return apiAuthed(
    `/monitoramento/instrumentos/${encodeURIComponent(nr)}/entregas`,
    entregaSchema,
    "POST",
    corpo,
  );
}

export function vincularEntregaLegada(
  revisaoId: number,
  itens: ItemEntregaInput[],
): Promise<EntregaEquipamento> {
  return apiAuthed(
    `/monitoramento/entregas-legadas/${revisaoId}/vincular`,
    entregaSchema,
    "POST",
    { itens },
  );
}

export function corrigirUnidade(
  unidadeId: number,
  corpo: CorrigirUnidadeInput,
): Promise<UnidadeEquipamento> {
  return apiAuthed(
    `/monitoramento/unidades/${unidadeId}`,
    unidadeSchema,
    "PATCH",
    corpo,
  );
}

export function excluirEntrega(
  entregaId: number,
  motivo: string,
): Promise<EntregaEquipamento> {
  return apiAuthed(
    `/monitoramento/entregas/${entregaId}`,
    entregaSchema,
    "DELETE",
    { motivo },
  );
}
