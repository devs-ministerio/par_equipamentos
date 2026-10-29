import { z } from "zod";
import { requisitar } from "@/lib/http-client";
import type { FiltroRelatorio } from "@/services/relatorios";

const registroSchema = z.object({
  instrumento: z.string(),
  convenente: z.string(),
  tipo: z.string(),
  uf: z.string().nullable(),
  municipio: z.string().nullable(),
  cnes: z.string().nullable(),
  item: z.string(),
  familia: z.string().nullable(),
  ordem: z.number().int(),
  marca: z.string().nullable(),
  modelo: z.string().nullable(),
  numero_serie: z.string().nullable(),
  vida_util_anos: z.number().int().nullable(),
  data_entrega: z.string(),
});
const previaSchema = z.object({
  total: z.number().int().nonnegative(),
  pagina: z.number().int().positive(),
  limite: z.number().int().positive(),
  itens: z.array(registroSchema),
});
export type RegistroEntregue = z.infer<typeof registroSchema>;

export function consultarEntregues(
  filtro: FiltroRelatorio,
  pagina: number,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    escopo: filtro.escopo,
    pagina: String(pagina),
    limite: "20",
  });
  const campos = {
    uf: filtro.uf,
    regiao: filtro.regiao,
    municipio: filtro.municipio,
    cnes: filtro.cnes,
    ano_inicio: filtro.anoInicio,
    ano_fim: filtro.anoFim,
    programa: filtro.programa,
    tipo_contratacao: filtro.tipoContratacao,
    equipamento: filtro.equipamento,
    busca: filtro.busca,
  };
  for (const [campo, valor] of Object.entries(campos))
    if (valor !== undefined) params.set(campo, String(valor));
  return requisitar(`/relatorios/entregues?${params}`, previaSchema, {
    signal,
  });
}
