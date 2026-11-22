import { z } from "zod";
import { requisitar } from "@/lib/http-client";

const fonteResumoSchema = z.object({
  fonte: z.string(),
  rotulo: z.string(),
  ultimo_sucesso_em: z.string().datetime({ offset: true }).nullable(),
});
const fonteDetalheSchema = fonteResumoSchema.extend({
  status: z.enum(["ok", "parcial", "erro"]),
  ultima_tentativa_em: z.string().datetime({ offset: true }),
  defasada: z.boolean(),
  itens_verificados: z.number().int().nonnegative(),
  itens_alterados: z.number().int().nonnegative(),
  erro: z.string().nullable(),
});
// Só o admin recebe o detalhe da coleta; os demais papéis recebem o resumo.
// O resumo é estrito: detalhe malformado falha em vez de virar resumo.
const fonteCapturaSchema = z.union([
  fonteDetalheSchema,
  fonteResumoSchema.strict(),
]);
export type FonteResumo = z.infer<typeof fonteResumoSchema>;
export type FonteDetalhe = z.infer<typeof fonteDetalheSchema>;
export type FonteCaptura = z.infer<typeof fonteCapturaSchema>;

export function temDetalhe(fonte: FonteCaptura): fonte is FonteDetalhe {
  return "status" in fonte;
}

export function fetchCapturasFontes(): Promise<FonteCaptura[]> {
  return requisitar("/fontes/capturas", z.array(fonteCapturaSchema).max(50));
}
