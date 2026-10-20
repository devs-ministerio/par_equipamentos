import type { ConvenioUnificado } from "@/types/monitoramento";
import {
  nomePrioritarioCanonico,
  resumirEquipamentoNaoPrioritario,
} from "./equipamento-catalogo";
import { normalizarTexto } from "@/utils/texto";

export type FonteEquipamentosFiltro = Pick<
  ConvenioUnificado,
  "numero" | "equipamentos"
>;

export function chaveEquipamentoFiltro(nome: string): string {
  const limpo = nome.replace(/^\s*\d+\s*-\s*/, "").trim();
  return nomePrioritarioCanonico(limpo) ?? normalizarTexto(limpo);
}

/** Somente marcadores canônicos da listagem; nunca classifica prosa planejada. */
export function equipamentosPorInstrumento(
  fontes: readonly FonteEquipamentosFiltro[],
) {
  return new Map(fontes.map((fonte) => [fonte.numero, fonte.equipamentos]));
}

export function opcoesEquipamentosFiltro(
  numeros: ReadonlySet<string>,
  fontes: readonly FonteEquipamentosFiltro[],
  classe: "todos" | "prioritario" | "outro",
) {
  const opcoes = new Map<string, string>();
  for (const fonte of fontes) {
    if (!numeros.has(fonte.numero)) continue;
    for (const marcador of fonte.equipamentos) {
      const canonico = nomePrioritarioCanonico(marcador.nome);
      const prioritario = marcador.prioritario || canonico !== null;
      if (classe !== "todos" && (classe === "prioritario") !== prioritario)
        continue;
      const value = chaveEquipamentoFiltro(marcador.nome);
      if (!value) continue;
      opcoes.set(
        value,
        canonico ?? resumirEquipamentoNaoPrioritario(marcador.nome),
      );
    }
  }
  return [...opcoes]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}
