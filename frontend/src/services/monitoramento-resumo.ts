import { z } from 'zod';
import { apiGetAuthed } from './monitoramento-client';

// ---------------------------------------------------------------------
// Monitoramento -- resumo agregado (overview/painel)
// ---------------------------------------------------------------------

const contagemRotuloSchema = z.object({ rotulo: z.string(), quantidade: z.number() });
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
});
export type ResumoMonitoramento = z.infer<typeof resumoMonitoramentoSchema>;

export function fetchResumoMonitoramento(): Promise<ResumoMonitoramento> {
  return apiGetAuthed('/monitoramento/resumo', resumoMonitoramentoSchema);
}
