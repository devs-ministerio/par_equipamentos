import { z } from "zod";
import { apiGet } from "./monitoramento-client";

// ---------------------------------------------------------------------
// Monitoramento -- catálogo de marcos (backend/app/routers/monitoramento.py)
// ---------------------------------------------------------------------

const marcoGrupoSchema = z.enum([
  "fase_geral",
  "cronograma_fisico",
  "regulatorio",
]);

const marcoCatalogoSchema = z.object({
  id: z.number(),
  codigo: z.string(),
  grupo: marcoGrupoSchema,
  ordem: z.number().nullable(),
  execucao_fisica_pct_referencia: z.number().nullable(),
  rotulo: z.string(),
  descricao_referencia: z.string().nullable(),
});
export type MarcoCatalogo = z.infer<typeof marcoCatalogoSchema>;

export function fetchMarcos(): Promise<MarcoCatalogo[]> {
  return apiGet("/monitoramento/marcos", z.array(marcoCatalogoSchema));
}
