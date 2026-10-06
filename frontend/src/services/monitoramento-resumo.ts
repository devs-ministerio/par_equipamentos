import { z } from "zod";
import { apiGetAuthed } from "./monitoramento-client";

// ---------------------------------------------------------------------
// Monitoramento -- resumo agregado (overview/painel)
// ---------------------------------------------------------------------

const contagemRotuloSchema = z.object({
  rotulo: z.string(),
  quantidade: z.number(),
});
export type ContagemRotulo = z.infer<typeof contagemRotuloSchema>;

const inauguracaoResumoSchema = z.object({
  nr_convenio: z.string(),
  nome_convenente: z.string(),
  municipio: z.string().nullable(),
  uf: z.string().nullable(),
  equipamento: z.string().nullable(),
  data: z.string(),
  realizada: z.boolean(),
  dias: z.number(),
});
export type InauguracaoResumo = z.infer<typeof inauguracaoResumoSchema>;

const licencaVencendoResumoSchema = z.object({
  nr_convenio: z.string(),
  nome_convenente: z.string(),
  data_validade: z.string(),
  dias: z.number(),
});
export type LicencaVencendoResumo = z.infer<typeof licencaVencendoResumoSchema>;

const divergenciaConclusaoSchema = z.object({
  nr_convenio: z.string(),
  nome_convenente: z.string(),
  tipo_contratacao: z.string().nullable(),
  fase_interna: z.string(),
  fonte_externa: z.string(),
  status_externo_original: z.string(),
  status_externo_normalizado: z.string(),
  atualizado_em: z.string(),
  risco: z.string(),
});
export type DivergenciaConclusao = z.infer<typeof divergenciaConclusaoSchema>;

const indicadoresInstrumentoSchema = z.object({
  nr_convenio: z.string(),
  acoes_pendentes: z.number(),
  acoes_atrasadas: z.number(),
  licenca_cnen_deferida: z.boolean(),
  pct_referencia_fase: z.number().nullable(),
  ultima_atividade_em: z.string().nullable(),
});
export type IndicadoresInstrumento = z.infer<
  typeof indicadoresInstrumentoSchema
>;

const acaoAbertaResumoSchema = z.object({
  id: z.number(),
  nr_convenio: z.string(),
  nome_convenente: z.string(),
  descricao: z.string(),
  data_prevista: z.string().nullable(),
  dias: z.number().nullable(),
  responsavel: z.string().nullable(),
});
export type AcaoAbertaResumo = z.infer<typeof acaoAbertaResumoSchema>;

const resumoMonitoramentoSchema = z.object({
  total_instrumentos: z.number(),
  pct_execucao_fisica_medio: z.number().nullable(),
  distribuicao_fase: z.array(contagemRotuloSchema),
  licencas_cnen_deferidas: z.number(),
  licencas_vencendo: z.array(licencaVencendoResumoSchema),
  por_tecnico_titular: z.array(contagemRotuloSchema),
  inauguracoes: z.array(inauguracaoResumoSchema),
  acoes_pendentes: z.number(),
  acoes_atrasadas: z.number(),
  nr_convenios: z.array(z.string()),
  divergencias_conclusao: z.array(divergenciaConclusaoSchema),
  divergencias_conclusao_por_fonte: z.array(contagemRotuloSchema),
  indicadores_por_instrumento: z.array(indicadoresInstrumentoSchema),
  acoes_em_aberto: z.array(acaoAbertaResumoSchema),
  fila_acoes_truncada: z.boolean(),
  gerado_em: z.string(),
});
export type ResumoMonitoramento = z.infer<typeof resumoMonitoramentoSchema>;

export function fetchResumoMonitoramento(): Promise<ResumoMonitoramento> {
  return apiGetAuthed("/monitoramento/resumo", resumoMonitoramentoSchema);
}
