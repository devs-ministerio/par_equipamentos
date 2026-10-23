import { z } from "zod";

/** Form "Registrar entrega": um bloco por item pendente; só os marcados entram.
 * A regra de negócio final (limite do planejado, série única) é do backend;
 * aqui só evita o round-trip óbvio. */
export const itemEntregaSchema = z.object({
  itemId: z.number(),
  selecionado: z.boolean(),
  quantidade: z.string(),
  marca: z.string().optional(),
  modelo: z.string().optional(),
  vidaUtilAnos: z.string().optional(),
  series: z.string().optional(),
  /** O que ainda falta entregar; `null` = quantidade planejada desconhecida. */
  falta: z.number().nullable(),
});
export type ItemEntregaFormValues = z.infer<typeof itemEntregaSchema>;

export function linhasDeSerie(texto: string | undefined): string[] {
  return (texto ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const registrarEntregaSchema = z
  .object({
    dataOcorrencia: z.string().min(1, "Informe a data da entrega."),
    observacao: z.string().max(1000).optional(),
    itens: z.array(itemEntregaSchema),
  })
  .superRefine((valores, ctx) => {
    if (valores.dataOcorrencia > new Date().toISOString().slice(0, 10)) {
      ctx.addIssue({
        code: "custom",
        path: ["dataOcorrencia"],
        message: "A data da entrega não pode estar no futuro.",
      });
    }
    const marcados = valores.itens
      .map((item, indice) => ({ item, indice }))
      .filter(({ item }) => item.selecionado);
    if (marcados.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["itens"],
        message: "Marque pelo menos um equipamento.",
      });
    }
    for (const { item, indice } of marcados) {
      const quantidade = Number(item.quantidade);
      const caminho = (campo: string) => ["itens", indice, campo];
      if (!Number.isInteger(quantidade) || quantidade < 1) {
        ctx.addIssue({
          code: "custom",
          path: caminho("quantidade"),
          message: "Informe uma quantidade inteira maior que zero.",
        });
        continue;
      }
      if (item.falta !== null && quantidade > item.falta) {
        ctx.addIssue({
          code: "custom",
          path: caminho("quantidade"),
          message: `Acima do planejado: faltam ${item.falta}.`,
        });
      }
      const series = linhasDeSerie(item.series);
      if (series.length > quantidade) {
        ctx.addIssue({
          code: "custom",
          path: caminho("series"),
          message: "Há mais números de série do que a quantidade.",
        });
      } else if (new Set(series).size !== series.length) {
        ctx.addIssue({
          code: "custom",
          path: caminho("series"),
          message: "Número de série repetido.",
        });
      }
    }
  });
export type RegistrarEntregaFormValues = z.infer<typeof registrarEntregaSchema>;

export function itensParaApi(
  itens: ItemEntregaFormValues[],
): import("@/services/entregas-equipamento").ItemEntregaInput[] {
  return itens
    .filter((i) => i.selecionado)
    .map((i) => ({
      item_id: i.itemId,
      quantidade: Number(i.quantidade),
      marca: i.marca?.trim() || null,
      modelo: i.modelo?.trim() || null,
      vida_util_anos: i.vidaUtilAnos ? Number(i.vidaUtilAnos) : null,
      series: linhasDeSerie(i.series),
      confirmar_quantidade_desconhecida: i.falta === null,
    }));
}
