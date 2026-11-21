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

const rendimentoSchema = z.object({
  id: z.number(),
  descricao: z.string(),
  valor_total: z.number().nullable(),
});
export type RendimentoItem = z.infer<typeof rendimentoSchema>;

const cancelamentoSchema = z.object({
  id: z.number(),
  item_id: z.number(),
  motivo: z.string(),
  criado_em: z.string(),
  ativo: z.boolean(),
});
export type CancelamentoUnidade = z.infer<typeof cancelamentoSchema>;

const itemSchema = z.object({
  id: z.number(),
  codigo_item: z.string().nullable(),
  nome: z.string(),
  descricao: z.string(),
  familia: z.string().nullable(),
  controla_unidade: z.boolean(),
  quantidade_planejada: z.number().nullable(),
  valor_total: z.number().nullable(),
  quantidade_cancelada: z.number().default(0),
  cancelamentos: z.array(cancelamentoSchema).default([]),
  previsao_entrega: z.string().nullable().default(null),
  quantidade_entregue: z.number(),
  situacao: z.enum(["pendente", "parcial", "entregue", "cancelado"]),
  ultima_entrega: z.string().nullable(),
  unidades: z.array(unidadeSchema),
  rendimentos: z.array(rendimentoSchema).default([]),
});
export type ItemEquipamento = z.infer<typeof itemSchema>;

const equipamentosSchema = z.object({
  nr_convenio: z.string(),
  pode_editar: z.boolean(),
  itens: z.array(itemSchema),
  outros_itens: z.number(),
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

export interface InauguracaoEntregaInput {
  necessaria: boolean;
  data_prevista?: string | null;
}

export interface RegistrarEntregaInput {
  chave_idempotencia: string;
  data_ocorrencia: string;
  observacao?: string | null;
  itens: ItemEntregaInput[];
  inauguracao?: InauguracaoEntregaInput | null;
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

export function corrigirDataEntrega(
  entregaId: number,
  dataOcorrencia: string,
  motivo: string,
): Promise<EntregaEquipamento> {
  return apiAuthed(
    `/monitoramento/entregas/${entregaId}/data`,
    entregaSchema,
    "PATCH",
    { data_ocorrencia: dataOcorrencia, motivo },
  );
}

export function cancelarUnidadePlanejada(
  itemId: number,
  motivo: string,
): Promise<CancelamentoUnidade> {
  return apiAuthed(
    `/monitoramento/itens/${itemId}/cancelamentos`,
    cancelamentoSchema,
    "POST",
    { motivo },
  );
}

export function reativarUnidadeCancelada(
  cancelamentoId: number,
  motivo: string,
): Promise<CancelamentoUnidade> {
  return apiAuthed(
    `/monitoramento/cancelamentos/${cancelamentoId}`,
    cancelamentoSchema,
    "DELETE",
    { motivo },
  );
}

const previsaoEntregaSchema = z.object({
  id: z.number(),
  item_id: z.number(),
  data_prevista: z.string(),
  ativo: z.boolean(),
});
export type PrevisaoEntrega = z.infer<typeof previsaoEntregaSchema>;

export function definirPrevisaoEntrega(
  itemId: number,
  dataPrevista: string,
): Promise<PrevisaoEntrega> {
  return apiAuthed(
    `/monitoramento/itens/${itemId}/previsao-entrega`,
    previsaoEntregaSchema,
    "PUT",
    { data_prevista: dataPrevista },
  );
}

export function removerPrevisaoEntrega(
  itemId: number,
  motivo: string,
): Promise<PrevisaoEntrega> {
  return apiAuthed(
    `/monitoramento/itens/${itemId}/previsao-entrega`,
    previsaoEntregaSchema,
    "DELETE",
    { motivo },
  );
}
