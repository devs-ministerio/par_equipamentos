import { z } from "zod";
import { apiGetAuthed } from "./monitoramento-client";

// Licença de operação pela fonte oficial da ANSN, por estabelecimento (backend/app/routers/licenca_operacao.py)
const vinculoSchema = z.object({
  matricula: z.string(),
  designacao: z.string().nullable(),
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
  area: z.string().nullable(),
  situacao: z.enum(["valida", "suspensa", "nao_consta"]),
  validade: z.string().nullable(),
  dias: z.number().nullable(),
});
export type LicencaVinculo = z.infer<typeof vinculoSchema>;

const licencaOperacaoSchema = z.object({
  exige: z.boolean(),
  cnes: z.string().nullable(),
  sem_cnes: z.boolean(),
  areas_exigidas: z.array(z.string()),
  areas_sem_vinculo: z.array(z.string()),
  vinculos: z.array(vinculoSchema),
  ultima_carga: z.string().nullable(),
});
export type LicencaOperacao = z.infer<typeof licencaOperacaoSchema>;

export function fetchLicencaOperacao(nr: string): Promise<LicencaOperacao> {
  return apiGetAuthed(
    `/monitoramento/instrumentos/${encodeURIComponent(nr)}/licenca-operacao`,
    licencaOperacaoSchema,
  );
}
