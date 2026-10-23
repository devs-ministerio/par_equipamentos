import type { ItemEquipamento } from "@/services/entregas-equipamento";

/** A descrição do SICONV costuma começar com o código ("000253-Arco Cirúrgico"). */
export function nomeSemCodigo(descricao: string): string {
  return descricao.replace(/^\s*\d{3,6}\s*[-–]\s*/, "").trim() || descricao;
}

/** Itens com o mesmo código e nome são equipamentos distintos: recebem "1/3". */
export function posicaoEntreIguais(
  itens: ItemEquipamento[],
): Map<number, string | null> {
  const chave = (i: ItemEquipamento) =>
    `${i.codigo_item ?? ""}|${nomeSemCodigo(i.descricao)}`;
  const total = new Map<string, number>();
  for (const i of itens) total.set(chave(i), (total.get(chave(i)) ?? 0) + 1);
  const visto = new Map<string, number>();
  return new Map(
    itens.map((i) => {
      const k = chave(i);
      const n = (visto.get(k) ?? 0) + 1;
      visto.set(k, n);
      return [i.id, (total.get(k) ?? 1) > 1 ? `${n}/${total.get(k)}` : null];
    }),
  );
}

/** Quanto ainda falta entregar; `null` quando a quantidade planejada é desconhecida. */
export function faltam(item: ItemEquipamento): number | null {
  return item.quantidade_planejada === null
    ? null
    : Math.max(item.quantidade_planejada - item.quantidade_entregue, 0);
}

export function rotuloFalta(item: ItemEquipamento): string {
  const falta = faltam(item);
  return falta === null
    ? "quantidade planejada desconhecida"
    : `faltam ${falta}`;
}
