import { z } from "zod";
import { requisitar } from "@/lib/http-client";
import { ApiError } from "@/lib/api-error";
import type { DecisaoLegadoInput } from "@/lib/validations/decisao-legado";
import { decisaoLegadoSchema } from "@/lib/validations/decisao-legado";

const confirmacaoSchema = z.enum([
  "nao_consultado",
  "nao_encontrado",
  "sem_publicacao",
  "confirmado",
]);
export type ConfirmacaoLegado = z.infer<typeof confirmacaoSchema>;
const situacaoSchema = z.enum(["novo", "em_analise", "aprovado", "rejeitado"]);
export type SituacaoLegado = z.infer<typeof situacaoSchema>;

const candidatoSchema = z.object({
  id: z.number().int(),
  numero: z.string(),
  id_proposta: z.string(),
  captura_id: z.number().int().positive(),
  versao: z.number().int().nonnegative(),
  situacao: situacaoSchema,
  confirmacao_portal: confirmacaoSchema,
  data_publicacao: z.string().nullable(),
  origem: z.enum(["snapshot_local", "siconv_oficial"]),
  descoberto_em: z.string().datetime({ offset: true }),
  verificado_em: z.string().datetime({ offset: true }),
  componentes: z
    .array(
      z.object({
        id_programa: z.string().regex(/^[0-9]+$/),
        nome_programa: z.string().min(1),
        componente: z.string().min(1),
      }),
    )
    .default([]),
  evidencias: z.array(
    z.object({
      id_item: z.string(),
      codigo: z.string(),
      nome: z.string(),
      descricao: z.string(),
      relacao: z.enum(["aquisicao", "modernizacao", "existente", "mencao"]),
    }),
  ),
});
const paginaSchema = z.object({
  total: z.number().int().nonnegative(),
  novos: z.number().int().nonnegative(),
  itens: z.array(candidatoSchema).max(50),
});
export type CandidatoLegado = z.infer<typeof candidatoSchema>;

export function fetchCandidatosLegados(
  pagina: number,
  busca: string,
  situacao: SituacaoLegado | undefined,
) {
  const params = new URLSearchParams({
    pagina: String(pagina),
    tamanho_pagina: "10",
  });
  if (busca) params.set("busca", busca);
  if (situacao) params.set("situacao", situacao);
  return requisitar(`/candidatos-legados?${params}`, paginaSchema);
}

export const decisaoSchema = z.object({
  id: z.number().int().positive(),
  candidato_id: z.number().int().positive(),
  captura_id: z.number().int().positive(),
  usuario_id: z.number().int().positive(),
  situacao_anterior: situacaoSchema,
  situacao: situacaoSchema,
  justificativa: z.string(),
  criado_em: z.string().datetime({ offset: true }),
});
const historicoSchema = z.object({
  total: z.number().int().nonnegative(),
  itens: z.array(decisaoSchema.extend({ usuario_nome: z.string() })).max(50),
});

export async function enviarDecisaoLegado(
  id: number,
  dados: DecisaoLegadoInput,
) {
  const parsed = decisaoLegadoSchema.safeParse(dados);
  if (!parsed.success)
    throw new ApiError(
      "Decisão inválida.",
      422,
      "Confira a justificativa da decisão.",
    );
  return requisitar(`/candidatos-legados/${id}/decisoes`, decisaoSchema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
  });
}

export function fetchHistoricoLegado(id: number, pagina: number) {
  return requisitar(
    `/candidatos-legados/${id}/historico?pagina=${pagina}&tamanho_pagina=10`,
    historicoSchema,
  );
}
