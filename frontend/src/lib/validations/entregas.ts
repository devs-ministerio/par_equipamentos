import { z } from "zod";
import type { ItemEntregaInput } from "@/services/entregas-equipamento";

/** Form "Registrar entrega": cada item marcado entra com uma ou mais unidades,
 * cada uma com os próprios dados. A regra final (limite do planejado, série
 * única) é do backend; aqui só evita o round-trip óbvio. */
export const unidadeEntregaSchema = z.object({
  marca: z.string().optional(),
  modelo: z.string().optional(),
  vidaUtilAnos: z.string().optional(),
  serie: z.string().optional(),
});
export type UnidadeEntregaFormValues = z.infer<typeof unidadeEntregaSchema>;

export const itemEntregaSchema = z.object({
  itemId: z.number(),
  selecionado: z.boolean(),
  /** O que ainda falta entregar; `null` = quantidade planejada desconhecida. */
  falta: z.number().nullable(),
  unidades: z.array(unidadeEntregaSchema),
});
export type ItemEntregaFormValues = z.infer<typeof itemEntregaSchema>;

export const unidadeVazia: UnidadeEntregaFormValues = {
  marca: "",
  modelo: "",
  vidaUtilAnos: "",
  serie: "",
};

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
      if (item.falta !== null && item.unidades.length > item.falta) {
        ctx.addIssue({
          code: "custom",
          path: ["itens", indice, "unidades"],
          message: `Acima do planejado: faltam ${item.falta}.`,
        });
      }
      const vistas = new Set<string>();
      item.unidades.forEach((u, k) => {
        const vida = u.vidaUtilAnos?.trim();
        if (vida && (!/^\d+$/.test(vida) || Number(vida) > 100)) {
          ctx.addIssue({
            code: "custom",
            path: ["itens", indice, "unidades", k, "vidaUtilAnos"],
            message: "Informe anos inteiros (0 a 100).",
          });
        }
        const serie = u.serie?.trim();
        if (!serie) return;
        if (vistas.has(serie)) {
          ctx.addIssue({
            code: "custom",
            path: ["itens", indice, "unidades", k, "serie"],
            message: "Número de série repetido.",
          });
        }
        vistas.add(serie);
      });
    }
  });
export type RegistrarEntregaFormValues = z.infer<typeof registrarEntregaSchema>;

export function itensParaApi(
  itens: ItemEntregaFormValues[],
): ItemEntregaInput[] {
  return itens
    .filter((i) => i.selecionado)
    .map((i) => ({
      item_id: i.itemId,
      unidades: i.unidades.map((u) => ({
        marca: u.marca?.trim() || null,
        modelo: u.modelo?.trim() || null,
        numero_serie: u.serie?.trim() || null,
        vida_util_anos: u.vidaUtilAnos?.trim() ? Number(u.vidaUtilAnos) : null,
      })),
      confirmar_quantidade_desconhecida: i.falta === null,
    }));
}
