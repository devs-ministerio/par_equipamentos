import { z } from "zod";
import { requisitar } from "@/lib/http-client";

const confirmacaoSchema = z.enum([
  "nao_consultado",
  "nao_encontrado",
  "sem_publicacao",
  "confirmado",
]);
export type ConfirmacaoLegado = z.infer<typeof confirmacaoSchema>;

const candidatoSchema = z.object({
  id: z.number().int(),
  numero: z.string(),
  id_proposta: z.string(),
  confirmacao_portal: confirmacaoSchema,
  data_publicacao: z.string().nullable(),
  origem: z.enum(["snapshot_local", "siconv_oficial"]),
  descoberto_em: z.string().datetime({ offset: true }),
  verificado_em: z.string().datetime({ offset: true }),
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
  itens: z.array(candidatoSchema).max(50),
});
export type CandidatoLegado = z.infer<typeof candidatoSchema>;

export function fetchCandidatosLegados(
  pagina: number,
  busca: string,
  confirmacao: ConfirmacaoLegado | undefined,
) {
  const params = new URLSearchParams({
    pagina: String(pagina),
    tamanho_pagina: "10",
  });
  if (busca) params.set("busca", busca);
  if (confirmacao) params.set("confirmacao", confirmacao);
  return requisitar(`/candidatos-legados?${params}`, paginaSchema);
}
