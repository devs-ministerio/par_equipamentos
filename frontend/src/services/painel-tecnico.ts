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
  regiao: contagemSchema,
  regiao_sem_titular: z.number(),
  meus: contagemSchema,
  atividade: z.object({
    lancamentos_total: z.number(),
    lancamentos_15d: z.number(),
    instrumentos_tocados: z.number(),
    ultimo_lancamento: z.string().nullable(),
    por_semana: z.array(
      z.object({ semana: z.string(), lancamentos: z.number() }),
    ),
  }),
});
export type PainelTecnico = z.infer<typeof painelSchema>;

const carteiraSchema = z.array(
  z.object({
    numero: z.string(),
    uf: z.string().nullable(),
    municipio: z.string().nullable(),
    convenente: z.string().nullable(),
    cnpj_convenente: z.string().nullable(),
    tipo_contratacao: z.string().nullable(),
    situacao: z.string().nullable(),
    fase: z.string().nullable(),
    valor_global: z.number().nullable(),
    em_aberto: z.boolean(),
    monitorado: z.boolean(),
    titular: z.string().nullable(),
    eventos: z.number(),
    acoes: z.number(),
    acoes_atrasadas: z.number(),
    lancado_recente: z.boolean(),
    sem_registro: z.boolean(),
  }),
);
export type LinhaCarteira = z.infer<typeof carteiraSchema>[number];

export function fetchCarteiraTecnico(
  usuarioId?: number,
): Promise<LinhaCarteira[]> {
  const query = usuarioId ? `?usuario_id=${usuarioId}` : "";
  return apiGetAuthed(
    `/monitoramento/painel-tecnico/carteira${query}`,
    carteiraSchema,
  );
}

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
