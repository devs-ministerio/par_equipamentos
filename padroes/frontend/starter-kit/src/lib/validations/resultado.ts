/**
 * lib/validations/resultado.ts
 *
 * Schema Zod do domínio "resultado" (Seção 8/9 — todo payload de API é
 * validado aqui, na camada de service, antes de chegar ao hook/UI).
 * Nunca declarar este schema dentro de um componente.
 */

import { z } from "zod";

export const kpiSchema = z.object({
  label: z.string(),
  value: z.string(),
  sub: z.string().optional(),
});

export const itemPlanoSchema = z.object({
  descricao: z.string(),
  qtd: z.number(),
  valorUnitario: z.string(),
  valorTotal: z.string(),
});

export const campoIdentificacaoSchema = z.object({
  label: z.string(),
  valor: z.string(),
});

export const resultadoSchema = z.object({
  id: z.string(),
  codigo: z.string(),
  status: z.enum(["monitorado", "em_analise", "concluido"]),
  statusLabel: z.string(),
  titulo: z.string(),
  documento: z.string(),
  valorGlobal: z.string(),
  percentualDesembolsado: z.number(),
  kpis: z.array(kpiSchema),
  identificacao: z.array(campoIdentificacaoSchema),
  itensPlano: z.array(itemPlanoSchema),
});

export const resultadoListSchema = z.array(resultadoSchema);
