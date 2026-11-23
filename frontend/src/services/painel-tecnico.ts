import { z } from "zod";
import { apiGetAuthed } from "./monitoramento-client";

const contagemSchema = z.object({
  instrumentos: z.number(),
  com_registro: z.number(),
  sem_registro: z.number(),
  concluidos: z.number(),
  com_repasse: z.number(),
  com_entrega: z.number(),
});

const painelSchema = z.object({
  escopo: z.enum(["individual", "todos"]),
  usuario: z
    .object({ id: z.number(), nome: z.string(), papel: z.string() })
    .nullable(),
  ufs: z.array(z.string()).nullable(),
  gerado_em: z.string(),
  carteira: z.object({
    elegiveis: z.number(),
    monitorados: z.number(),
    cobertura_pct: z.number().nullable(),
    faltam_em_aberto: z.number(),
    faltam_concluidos: z.number(),
    valor_faltam_em_aberto: z.number(),
    valor_faltam_concluidos: z.number(),
  }),
  faltantes: z.array(
    z.object({
      numero: z.string(),
      uf: z.string().nullable(),
      municipio: z.string().nullable(),
      convenente: z.string().nullable(),
      situacao: z.string().nullable(),
      valor_global: z.number().nullable(),
      em_aberto: z.boolean(),
    }),
  ),
  regiao: contagemSchema,
  regiao_sem_titular: z.number(),
  meus: contagemSchema,
  atividade: z.object({
    lancamentos_total: z.number(),
    lancamentos_14d: z.number(),
    instrumentos_tocados: z.number(),
    ultimo_lancamento: z.string().nullable(),
    por_semana: z.array(
      z.object({ semana: z.string(), lancamentos: z.number() }),
    ),
  }),
  acoes: z.object({
    abertas: z.number(),
    atrasadas: z.number(),
    proximas_7d: z.number(),
  }),
  meus_sem_registro: z.array(
    z.object({
      nr_convenio: z.string(),
      municipio: z.string().nullable(),
      uf: z.string().nullable(),
    }),
  ),
});
export type PainelTecnico = z.infer<typeof painelSchema>;

const tecnicosSchema = z.array(
  z.object({
    id: z.number(),
    nome: z.string(),
    ufs: z.array(z.string()),
    instrumentos: z.number(),
  }),
);
export type TecnicoPainel = z.infer<typeof tecnicosSchema>[number];

export function fetchPainelTecnico(usuarioId?: number): Promise<PainelTecnico> {
  const query = usuarioId ? `?usuario_id=${usuarioId}` : "";
  return apiGetAuthed(`/monitoramento/painel-tecnico${query}`, painelSchema);
}

export function fetchTecnicosPainel(): Promise<TecnicoPainel[]> {
  return apiGetAuthed("/monitoramento/painel-tecnico/tecnicos", tecnicosSchema);
}
