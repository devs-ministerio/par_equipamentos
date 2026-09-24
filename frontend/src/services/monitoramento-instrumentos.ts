import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import { requisitar } from "@/lib/http-client";
import { apiAuthed, apiGetAuthed } from "./monitoramento-client";

// ---------------------------------------------------------------------
// Monitoramento -- instrumentos
// ---------------------------------------------------------------------

const eventoMarcoSchema = z.object({
  id: z.number(),
  marco_id: z.number(),
  // Obrigatório pra marco de grupo físico/regulatório, null quando o
  // próprio evento já é de grupo=fase_geral (Plan Mode monitoramento-
  // evolucao 2026-09-19).
  fase_geral_id: z.number().nullable().optional(),
  data_ocorrencia: z.string().nullable(),
  data_prevista: z.string().nullable(),
  status_regulatorio: z.string().nullable(),
  numero_documento: z.string().nullable(),
  data_validade: z.string().nullable(),
  observacao: z.string().nullable(),
  autor_nome: z.string().nullable().optional(),
  created_at: z.string(),
  // Ciclo de vida append-only -- ver docstring do model no backend.
  atualizado_em: z.string().nullable().optional(),
  substituido_por_id: z.number().nullable().optional(),
  deletado_em: z.string().nullable().optional(),
  deletado_por_nome: z.string().nullable().optional(),
  motivo_exclusao: z.string().nullable().optional(),
  ativo: z.boolean().optional().default(true),
});
export type EventoMarco = z.infer<typeof eventoMarcoSchema>;

const instrumentoEquipamentoSchema = z.object({
  id: z.number(),
  nr_convenio: z.string(),
  cnpj_convenente: z.string().nullable(),
  nome_convenente: z.string(),
  municipio: z.string().nullable(),
  uf: z.string().nullable(),
  cnes: z.string().nullable(),
  equipamento_descricao: z.string().nullable(),
  equipamento_marca: z.string().nullable(),
  equipamento_modelo: z.string().nullable(),
  equipamento_numero_serie: z.string().nullable(),
  equipamento_vida_util_anos: z.number().nullable(),
  programa: z.string().nullable(),
  tp_instrumento_programa: z.string().nullable(),
  componente: z.string().nullable(),
  ano_instrumento: z.number().nullable(),
  tipo_contratacao: z.string().nullable(),
  origem_dado: z.string().nullable(),
  tipologia: z.enum(["A", "CV", "C", "EO", "C.B", "NA"]).nullable(),
  investimento_aquisicao: z.number().nullable(),
  situacao_programa: z.string().nullable(),
  natureza_servico: z.string().nullable(),
  tecnico_titular: z.string().nullable(),
  tecnico_suplente: z.string().nullable(),
  nivel_monitoramento: z.string().nullable(),
  modalidade_onco: z.string().nullable(),
  responsavel_execucao_nome: z.string().nullable(),
  responsavel_execucao_contato: z.string().nullable(),
  // Situação da prestação de contas no SICONV legado -- sincronizada pelo
  // job_verificacao_siconv.py (só tipo_contratacao="Convênio"). Diferente
  // de `situacao` (Portal da Transparência, buscada ao vivo, não é campo
  // salvo).
  situacao_prestacao_contas: z.string().nullable(),
  // Situação da parceria/ordem de pagamento no TransfereGov Novo --
  // sincronizada por job_verificacao_transferegov.py. Só existe pra
  // tipo_contratacao="Parceria TransfereGov". Sem estado "Concluída" nesta
  // API (testado ao vivo) -- situacao_parceria pode ficar "Aprovada" mesmo
  // com a ordem de pagamento já "Paga", por isso são 2 campos separados.
  situacao_parceria_transferegov: z.string().nullable(),
  situacao_ordem_pagamento_transferegov: z.string().nullable(),
  // Só vem preenchido em GET /monitoramento/instrumentos (lista) -- ver
  // docstring do backend. Ausente/null nos outros endpoints.
  fase_atual: z.string().nullable().optional(),
});
export type InstrumentoEquipamento = z.infer<
  typeof instrumentoEquipamentoSchema
>;

export function fetchInstrumentos(): Promise<InstrumentoEquipamento[]> {
  return apiGetAuthed(
    "/monitoramento/instrumentos",
    z.array(instrumentoEquipamentoSchema),
  );
}

/** POST /monitoramento/instrumentos: entrada explícita no monitoramento
 * para convênios, propostas ou instrumentos/programas conhecidos. */
export interface CriarInstrumentoInput {
  nr_convenio: string;
  cnpj_convenente: string;
  nome_convenente: string;
  tipo_contratacao: string;
  municipio?: string | null;
  uf?: string | null;
  cnes?: string | null;
  programa?: string | null;
  componente?: string | null;
  ano_instrumento?: number | null;
  tecnico_titular?: string | null;
  tecnico_suplente?: string | null;
}

export function criarInstrumento(
  corpo: CriarInstrumentoInput,
): Promise<InstrumentoEquipamento> {
  return apiAuthed(
    "/monitoramento/instrumentos",
    instrumentoEquipamentoSchema,
    "POST",
    corpo,
  );
}

const valorSituacaoAoVivoSchema = z.object({
  disponivel: z.boolean(),
  valor: z.number().nullable().optional(),
  valor_liberado: z.number().nullable().optional(),
  situacao: z.string().nullable().optional(),
  valor_suspeito: z.boolean().optional().default(false),
});
export type ValorSituacaoAoVivo = z.infer<typeof valorSituacaoAoVivoSchema>;

const instrumentoTimelineSchema = z.object({
  instrumento: instrumentoEquipamentoSchema,
  ao_vivo: valorSituacaoAoVivoSchema,
  eventos: z.array(eventoMarcoSchema),
});
export type InstrumentoTimeline = z.infer<typeof instrumentoTimelineSchema>;

/** `null` = convênio sem instrumento seedado (404 -- caso normal pros
 * convênios ainda não monitorados). Qualquer outra falha continua
 * lançando `ApiError`, igual ao resto da camada de services. */
export async function fetchInstrumentoTimeline(
  nrConvenio: string,
): Promise<InstrumentoTimeline | null> {
  try {
    return await requisitar(
      `/monitoramento/instrumentos/${nrConvenio}`,
      instrumentoTimelineSchema,
      undefined,
    );
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export interface CadastroInstrumentoInput {
  tecnico_titular?: string | null;
  tecnico_suplente?: string | null;
  nivel_monitoramento?: string | null;
  tipologia?: string | null;
  modalidade_onco?: string | null;
  responsavel_execucao_nome?: string | null;
  responsavel_execucao_contato?: string | null;
  cnes?: string | null;
}

export function patchCadastroInstrumento(
  nrConvenio: string,
  corpo: CadastroInstrumentoInput,
): Promise<InstrumentoEquipamento> {
  return apiAuthed(
    `/monitoramento/instrumentos/${nrConvenio}`,
    instrumentoEquipamentoSchema,
    "PATCH",
    corpo,
  );
}

export interface RegistrarEventoInput {
  marco_id: number;
  // Obrigatório quando o marco escolhido é de cronograma físico/
  // regulatório (validado no backend) -- ver eventoMarcoSchema.
  fase_geral_id?: number | null;
  confirmar_inauguracao?: boolean;
  data_ocorrencia?: string | null;
  data_prevista?: string | null;
  status_regulatorio?: string | null;
  numero_documento?: string | null;
  data_validade?: string | null;
  observacao?: string | null;
  equipamento_marca?: string | null;
  equipamento_modelo?: string | null;
  equipamento_numero_serie?: string | null;
  equipamento_vida_util_anos?: number | null;
}

export function registrarEvento(
  nrConvenio: string,
  corpo: RegistrarEventoInput,
): Promise<EventoMarco> {
  return apiAuthed(
    `/monitoramento/instrumentos/${nrConvenio}/eventos`,
    eventoMarcoSchema,
    "POST",
    corpo,
  );
}

/** Corrigir (append-only, ver docstring do model no backend) -- lança um
 * evento novo e fecha o antigo; nunca UPDATE. */
export interface EditarEventoInput {
  fase_geral_id?: number | null;
  data_ocorrencia?: string | null;
  data_prevista?: string | null;
  status_regulatorio?: string | null;
  numero_documento?: string | null;
  data_validade?: string | null;
  observacao?: string | null;
}

export function editarEvento(
  eventoId: number,
  corpo: EditarEventoInput,
): Promise<EventoMarco> {
  return apiAuthed(
    `/monitoramento/eventos/${eventoId}`,
    eventoMarcoSchema,
    "PATCH",
    corpo,
  );
}

export function excluirEvento(
  eventoId: number,
  motivo: string,
): Promise<EventoMarco> {
  return apiAuthed(
    `/monitoramento/eventos/${eventoId}`,
    eventoMarcoSchema,
    "DELETE",
    { motivo },
  );
}
