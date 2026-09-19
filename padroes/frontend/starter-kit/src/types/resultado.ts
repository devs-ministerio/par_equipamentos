/**
 * types/resultado.ts
 *
 * Tipos sempre derivados do schema Zod (Seção 8 — "Zod Infer" é obrigatório,
 * nunca tipo manual desacoplado do contrato real da API).
 */

import type { z } from "zod";
import type {
  kpiSchema,
  itemPlanoSchema,
  campoIdentificacaoSchema,
  resultadoSchema,
} from "@/lib/validations/resultado";

export type Kpi = z.infer<typeof kpiSchema>;
export type ItemPlano = z.infer<typeof itemPlanoSchema>;
export type CampoIdentificacao = z.infer<typeof campoIdentificacaoSchema>;
export type Resultado = z.infer<typeof resultadoSchema>;
