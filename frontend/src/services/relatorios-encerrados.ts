import { z } from "zod";
import { requisitar } from "@/lib/http-client";
import type { FiltroRelatorio } from "@/services/relatorios";

const registroSchema = z.object({
  chave: z.string(),
  numero: z.string(),
  nome: z.string(),
  tipo: z.string(),
  uf: z.string().nullable(),
  municipio: z.string().nullable(),
  cnes: z.string().nullable(),
  valor_global: z
    .union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)])
    .nullable(),
  motivo: z.string(),
  evidencia: z.string(),
  data_conclusao: z.string().nullable(),
  situacao_carteira: z.string().nullable(),
  situacao_monitoramento: z.string().nullable(),
  situacao_oficial: z.string().nullable(),
  pendencia: z.boolean(),
});
const previaSchema = z.object({
  total: z.number().int().nonnegative(),
  total_pendencias: z.number().int().nonnegative(),
  pagina: z.number().int().positive(),
  pagina_pendencias: z.number().int().positive(),
  limite: z.number().int().positive(),
  itens: z.array(registroSchema),
  pendencias: z.array(registroSchema),
});
export type RegistroEncerrado = z.infer<typeof registroSchema>;

export function consultarEncerrados(
  filtro: FiltroRelatorio,
  pagina: number,
  paginaPendencias: number,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    escopo: filtro.escopo,
    pagina: String(pagina),
    pagina_pendencias: String(paginaPendencias),
    limite: "20",
  });
  const campos = {
    uf: filtro.uf,
    regiao: filtro.regiao,
    municipio: filtro.municipio,
    cnes: filtro.cnes,
    ano_inicio: filtro.anoInicio,
    ano_fim: filtro.anoFim,
    situacao: filtro.situacao,
    programa: filtro.programa,
    tipo_contratacao: filtro.tipoContratacao,
    equipamento: filtro.equipamento,
    busca: filtro.busca,
  };
  for (const [campo, valor] of Object.entries(campos))
    if (valor !== undefined) params.set(campo, String(valor));
  return requisitar(`/relatorios/encerrados?${params}`, previaSchema, {
    signal,
  });
}
