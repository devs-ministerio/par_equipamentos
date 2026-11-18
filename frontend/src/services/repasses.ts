import { z } from "zod";
import { apiAuthed, apiGetAuthed } from "./monitoramento-client";

const repasseSchema = z.object({
  id: z.number(),
  tipo: z.enum(["integral", "parcial"]),
  origem: z.enum(["fonte", "manual"]),
  justificativa: z.string().nullable(),
  autor_id: z.number().nullable(),
  criado_em: z.string(),
});
export type Repasse = z.infer<typeof repasseSchema>;

const situacaoRepasseSchema = z.object({
  repasse: repasseSchema.nullable(),
  repasse_previsto: z.boolean(),
  fase_calculada: z.string(),
});
export type SituacaoRepasse = z.infer<typeof situacaoRepasseSchema>;

export interface ConfirmarRepasseInput {
  tipo: "integral" | "parcial";
  justificativa?: string | null;
}

export function fetchSituacaoRepasse(nr: string): Promise<SituacaoRepasse> {
  return apiGetAuthed(
    `/monitoramento/instrumentos/${encodeURIComponent(nr)}/repasse`,
    situacaoRepasseSchema,
  );
}

export function confirmarRepasse(
  nr: string,
  corpo: ConfirmarRepasseInput,
): Promise<Repasse> {
  return apiAuthed(
    `/monitoramento/instrumentos/${encodeURIComponent(nr)}/repasse`,
    repasseSchema,
    "POST",
    corpo,
  );
}
