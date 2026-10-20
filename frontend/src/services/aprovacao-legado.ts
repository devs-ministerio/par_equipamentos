import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import { requisitar } from "@/lib/http-client";
import {
  aprovacaoLegadoSchema,
  referenciaProvaLegadoSchema,
  type AprovacaoLegadoInput,
} from "@/lib/validations/aprovacao-legado";
import { decisaoSchema } from "./candidatos-legados";

const provaSchema = referenciaProvaLegadoSchema.extend({
  candidato_id: z.number().int().positive(),
  numero: z.string(),
  situacao: z.string(),
  valor_global: z.string().regex(/^-?\d+(?:\.\d+)?$/),
  convenente_nome: z.string(),
  municipio: z.string(),
  uf: z.string(),
  capturado_em: z.string().datetime({ offset: true }),
  expira_em: z.string().datetime({ offset: true }),
});
export type ProvaLegado = z.infer<typeof provaSchema>;

const aprovacaoSchema = decisaoSchema.extend({
  situacao: z.literal("aprovado"),
  convenio_id: z.number().int().positive(),
  recaptura_id: z.number().int().positive(),
});

export function fetchProvaLegado(id: number) {
  return requisitar(
    `/candidatos-legados/${id}/prova`,
    provaSchema.refine((prova) => prova.candidato_id === id),
  );
}

export async function enviarAprovacaoLegado(
  id: number,
  dados: AprovacaoLegadoInput,
) {
  const parsed = aprovacaoLegadoSchema.safeParse(dados);
  if (!parsed.success)
    throw new ApiError(
      "Aprovação inválida.",
      422,
      "Confira a prova e a justificativa antes de aprovar.",
    );
  return requisitar(
    `/candidatos-legados/${id}/aprovacoes`,
    aprovacaoSchema.refine(
      (resposta) =>
        resposta.candidato_id === id &&
        resposta.captura_id === parsed.data.captura_id &&
        resposta.recaptura_id === parsed.data.recaptura_id,
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    },
  );
}
