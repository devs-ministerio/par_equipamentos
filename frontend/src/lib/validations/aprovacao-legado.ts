import { z } from "zod";

export const referenciaProvaLegadoSchema = z.object({
  captura_id: z.number().int().positive(),
  recaptura_id: z.number().int().positive(),
  hash_revisado: z.string().regex(/^[a-f0-9]{64}$/),
  versao: z.number().int().nonnegative(),
});

export const aprovacaoLegadoSchema = referenciaProvaLegadoSchema
  .extend({
    chave: z.uuid(),
    justificativa: z
      .string()
      .trim()
      .min(3, "Informe a justificativa com pelo menos 3 caracteres.")
      .max(1000),
    tecnico_titular_id: z.number().int().positive().optional(),
  })
  .strict();

export const confirmacaoAprovacaoSchema = aprovacaoLegadoSchema;

export type AprovacaoLegadoInput = z.infer<typeof aprovacaoLegadoSchema>;
export type ConfirmacaoAprovacaoInput = z.infer<
  typeof confirmacaoAprovacaoSchema
>;
