import { z } from "zod";
import { apiGetAuthed } from "./monitoramento-client";

// ---------------------------------------------------------------------
// CNES -- `buscarCnesReferencia` alimenta um seletor (não texto livre) de
// CNES válido, tanto no cadastro do instrumento quanto no card da proposta.
// ---------------------------------------------------------------------

const cnesReferenciaSchema = z.object({
  cnes: z.string(),
  nome_estabelecimento: z.string(),
  municipio: z.string().nullable(),
  uf: z.string().nullable(),
});
export type CnesReferencia = z.infer<typeof cnesReferenciaSchema>;

export function buscarCnesReferencia(q: string): Promise<CnesReferencia[]> {
  if (q.trim().length < 2) return Promise.resolve([]);
  return apiGetAuthed(
    `/monitoramento/cnes-referencia?q=${encodeURIComponent(q)}`,
    z.array(cnesReferenciaSchema),
  );
}
