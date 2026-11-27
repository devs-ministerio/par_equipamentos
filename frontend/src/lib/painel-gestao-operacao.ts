import type {
  EquipamentoInstrumentoResumo,
  ResumoMonitoramento,
} from "@/services/monitoramento-resumo";
import { COR_REALIZADA } from "@/lib/monitoramento-painel-palette";
import { instrumentoEmOperacao } from "@/lib/painel-gestao-andamento";

export const COR_EM_OPERACAO = COR_REALIZADA;
export const COR_ENTREGUE = "var(--painel-chart-turquesa)";
export const COR_PLANEJADO =
  "color-mix(in srgb, var(--primary) 25%, transparent)";

export const LEGENDA_OPERACAO = [
  { nome: "Em operação", cor: COR_EM_OPERACAO },
  { nome: "Entregues, a inaugurar", cor: COR_ENTREGUE },
  { nome: "Planejados", cor: COR_PLANEJADO },
];

export interface FamiliaOperacao {
  familia: string;
  /** Total planejado (inclui o que já foi entregue). */
  planejado: number;
  /** Entregues em instrumentos que ainda precisam de inauguração. */
  entregue: number;
  /** Entregues e em operação. */
  operacao: number;
}

/** Equipamentos por tipo: em operação, entregues (a inaugurar) e o restante planejado, só do recorte. */
export function equipamentosPorSituacao(
  linhas: EquipamentoInstrumentoResumo[],
  numeros: ReadonlySet<string>,
  etapas: ResumoMonitoramento["etapas_por_instrumento"],
): FamiliaOperacao[] {
  const etapaPorNumero = new Map(etapas.map((e) => [e.nr_convenio, e]));
  const mapa = new Map<string, FamiliaOperacao>();
  for (const l of linhas) {
    if (!numeros.has(l.nr_convenio)) continue;
    const atual = mapa.get(l.familia) ?? {
      familia: l.familia,
      planejado: 0,
      entregue: 0,
      operacao: 0,
    };
    atual.planejado += l.planejado;
    if (instrumentoEmOperacao(etapaPorNumero.get(l.nr_convenio)))
      atual.operacao += l.entregue;
    else atual.entregue += l.entregue;
    mapa.set(l.familia, atual);
  }
  return [...mapa.values()].sort(
    (a, b) => b.planejado - a.planejado || a.familia.localeCompare(b.familia),
  );
}

export function totaisOperacao(itens: FamiliaOperacao[]) {
  const operacao = itens.reduce((t, f) => t + f.operacao, 0);
  const entregue = itens.reduce((t, f) => t + f.entregue, 0);
  const planejado = itens.reduce((t, f) => t + f.planejado, 0);
  return {
    operacao,
    entregue,
    planejado,
    restante: planejado - operacao - entregue,
  };
}
