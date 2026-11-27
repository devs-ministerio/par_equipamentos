import { z } from "zod";
import { requisitar } from "@/lib/http-client";
import {
  parametrosRelatorio,
  type FiltroRelatorio,
  type NivelRelatorio,
  type TipoRelatorio,
} from "./relatorios";

const previaSchema = z.object({
  colunas: z.array(z.string()),
  linhas: z.array(z.array(z.union([z.string(), z.number()]).nullable())),
  total: z.number().int().nonnegative(),
  total_linhas: z.number().int().nonnegative(),
  unidade: z.enum(["instrumentos", "unidades", "propostas"]),
});

export type PreviaRelatorio = z.infer<typeof previaSchema>;
export const LIMITE_PREVIA_RELATORIO = 20;

export function consultarPreviaRelatorio(
  tipo: Exclude<TipoRelatorio, "analise_merito">,
  nivel: NivelRelatorio,
  filtro: FiltroRelatorio,
  pagina: number,
  signal?: AbortSignal,
) {
  const params = parametrosRelatorio(tipo, nivel, filtro);
  params.set("pagina", String(pagina));
  params.set("limite", String(LIMITE_PREVIA_RELATORIO));
  return requisitar(`/relatorios/previa?${params}`, previaSchema, { signal });
}
