import { z } from "zod";
import { apiAuthed, apiGetAuthed } from "./monitoramento-client";

// Fila de revisão da classificação dos itens do plano
// (backend/app/routers/classificacao_itens.py)

export const TIPOS_LANCAMENTO = [
  "aquisicao",
  "rendimento_aplicacao",
  "acessorio_insumo",
  "multiplo",
  "nao_equipamento",
] as const;
export type TipoLancamento = (typeof TIPOS_LANCAMENTO)[number];

const itemSchema = z.object({
  id: z.number(),
  convenio_numero: z.string(),
  instrumento_nr_convenio: z.string().nullable(),
  descricao: z.string(),
  valor_total: z.number().nullable(),
  tipo_lancamento: z.enum(TIPOS_LANCAMENTO),
  codigo_item: z.string().nullable(),
  familia: z.string().nullable(),
  motivo: z.string().nullable(),
});
export type ItemParaRevisao = z.infer<typeof itemSchema>;

export interface DecisaoItemInput {
  acao: "confirmar" | "corrigir" | "nao_equipamento";
  tipo_lancamento?: TipoLancamento;
  codigo_item?: string;
  observacao?: string;
}

export function fetchFilaClassificacao(): Promise<ItemParaRevisao[]> {
  return apiGetAuthed("/monitoramento/classificacao/fila", z.array(itemSchema));
}

export function decidirItem(
  itemId: number,
  corpo: DecisaoItemInput,
): Promise<ItemParaRevisao> {
  return apiAuthed(
    `/monitoramento/classificacao/itens/${itemId}`,
    itemSchema,
    "POST",
    corpo,
  );
}
