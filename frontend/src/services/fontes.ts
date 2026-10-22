import { z } from "zod";
import { requisitar } from "@/lib/http-client";

const fonteCapturaSchema = z.object({
  fonte: z.string(),
  rotulo: z.string(),
  status: z.enum(["ok", "parcial", "erro"]),
  ultima_tentativa_em: z.string().datetime({ offset: true }),
  ultimo_sucesso_em: z.string().datetime({ offset: true }).nullable(),
  defasada: z.boolean(),
  itens_verificados: z.number().int().nonnegative(),
  itens_alterados: z.number().int().nonnegative(),
  erro: z.string().nullable(),
});
export type FonteCaptura = z.infer<typeof fonteCapturaSchema>;

export function fetchCapturasFontes(): Promise<FonteCaptura[]> {
  return requisitar("/fontes/capturas", z.array(fonteCapturaSchema).max(50));
}
