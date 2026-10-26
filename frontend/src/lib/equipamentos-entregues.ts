import type { ContagemRotulo } from "@/services/monitoramento-resumo";
import type { EquipamentoInstrumentoResumo } from "@/services/monitoramento-resumo";

export interface FamiliaEntregue {
  familia: string;
  planejado: number;
  entregue: number;
}

/** Soma planejado e entregue por família, só dos instrumentos do recorte. */
export function entreguesPorFamilia(
  linhas: EquipamentoInstrumentoResumo[],
  numeros: Set<string>,
): FamiliaEntregue[] {
  const mapa = new Map<string, FamiliaEntregue>();
  for (const l of linhas) {
    if (!numeros.has(l.nr_convenio)) continue;
    const atual = mapa.get(l.familia) ?? {
      familia: l.familia,
      planejado: 0,
      entregue: 0,
    };
    atual.planejado += l.planejado;
    atual.entregue += l.entregue;
    mapa.set(l.familia, atual);
  }
  return [...mapa.values()].sort(
    (a, b) => b.planejado - a.planejado || a.familia.localeCompare(b.familia),
  );
}

export type { ContagemRotulo };
