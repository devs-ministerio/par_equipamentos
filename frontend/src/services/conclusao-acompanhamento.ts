import { z } from "zod";
import { apiAuthed, apiGetAuthed } from "./monitoramento-client";

// ---------------------------------------------------------------------
// Conclusão do acompanhamento (backend/app/routers/conclusao.py)
// ---------------------------------------------------------------------

const resultadoSchema = z.enum(["integral", "parcial", "sem_entregas"]);
export type ResultadoConclusao = z.infer<typeof resultadoSchema>;

const conclusaoSchema = z.object({
  id: z.number(),
  resultado: resultadoSchema,
  data_conclusao: z.string(),
  justificativa: z.string().nullable(),
  data_inauguracao: z.string().nullable(),
});
export type Conclusao = z.infer<typeof conclusaoSchema>;

const avaliacaoSchema = z.object({
  nr_convenio: z.string(),
  pode_editar: z.boolean(),
  conclusao: conclusaoSchema.nullable(),
  resultado: resultadoSchema,
  exige_justificativa: z.boolean(),
  itens_exigidos: z.number(),
  itens_completos: z.number(),
  impedimentos: z.array(
    z.object({
      tipo: z.enum([
        "item_pendente",
        "sem_item_controlado",
        "entrega_legada",
        "item_em_revisao",
        "acao_aberta",
      ]),
      descricao: z.string(),
    }),
  ),
});
export type AvaliacaoConclusao = z.infer<typeof avaliacaoSchema>;

export interface ConcluirInput {
  resultado_confirmado: ResultadoConclusao;
  data_conclusao: string;
  justificativa: string | null;
  data_inauguracao: string | null;
}

export function fetchAvaliacaoConclusao(
  nr: string,
): Promise<AvaliacaoConclusao> {
  return apiGetAuthed(
    `/monitoramento/instrumentos/${encodeURIComponent(nr)}/conclusao`,
    avaliacaoSchema,
  );
}

export function concluirAcompanhamento(
  nr: string,
  corpo: ConcluirInput,
): Promise<Conclusao> {
  return apiAuthed(
    `/monitoramento/instrumentos/${encodeURIComponent(nr)}/conclusao`,
    conclusaoSchema,
    "POST",
    corpo,
  );
}

export function reabrirAcompanhamento(
  nr: string,
  motivo: string,
): Promise<Conclusao> {
  return apiAuthed(
    `/monitoramento/instrumentos/${encodeURIComponent(nr)}/conclusao`,
    conclusaoSchema,
    "DELETE",
    { motivo },
  );
}
