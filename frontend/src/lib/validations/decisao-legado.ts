import { z } from "zod";

export const decisaoLegadoSchema = z.object({
  acao: z.enum(["iniciar_analise", "rejeitar"]),
  chave: z.uuid(),
  captura_id: z.number().int().positive(),
  versao: z.number().int().nonnegative(),
  justificativa: z
    .string()
    .trim()
    .min(3, "Informe uma justificativa com pelo menos 3 caracteres.")
    .max(1000),
});
export type DecisaoLegadoInput = z.infer<typeof decisaoLegadoSchema>;
