import type { EquipamentoInstrumentoResumo } from "@/services/monitoramento-resumo";
import type { InstrumentoEquipamento } from "@/services/monitoramento-instrumentos";
import {
  motivoOperacao,
  instrumentoEmOperacao,
  type Etapas,
} from "@/lib/painel-gestao-andamento";

export interface EntregaUf {
  uf: string;
  /** Total planejado (inclui o que já foi entregue). */
  planejado: number;
  /** Entregues em instrumentos que ainda precisam de inauguração. */
  entregue: number;
  /** Entregues e em operação. */
  operacao: number;
}

/** Equipamentos por UF do instrumento: em operação, entregues (a inaugurar) e planejados. */
export function entregaPorUf(
  instrumentos: InstrumentoEquipamento[],
  linhas: EquipamentoInstrumentoResumo[],
  etapas: Etapas[],
): EntregaUf[] {
  const etapaPorNumero = new Map(etapas.map((e) => [e.nr_convenio, e]));
  const ufPorNumero = new Map(
    instrumentos.map((i) => [i.nr_convenio, i.uf ?? "—"]),
  );
  const mapa = new Map<string, EntregaUf>();
  for (const l of linhas) {
    const uf = ufPorNumero.get(l.nr_convenio);
    if (uf === undefined || l.planejado <= 0) continue;
    const atual = mapa.get(uf) ?? {
      uf,
      planejado: 0,
      entregue: 0,
      operacao: 0,
    };
    atual.planejado += l.planejado;
    if (instrumentoEmOperacao(etapaPorNumero.get(l.nr_convenio)))
      atual.operacao += l.entregue;
    else atual.entregue += l.entregue;
    mapa.set(uf, atual);
  }
  return [...mapa.values()].sort(
    (a, b) => b.planejado - a.planejado || a.uf.localeCompare(b.uf),
  );
}

export interface EntregaInauguracaoAno {
  ano: string;
  inaugurados: number;
  dispensados: number;
}

/**
 * Equipamentos entregues por ano, só onde a entrega está resolvida:
 * - inauguração dispensada: cada unidade entra no ano da própria entrega, mesmo com itens pendentes;
 * - inauguração confirmada: todas as unidades entram no ano da inauguração;
 * - acelerador linear concluído sem registro: cada unidade entra no ano da entrega (vale como inauguração).
 * Instrumentos que ainda precisam de inauguração não entram; `aguardando` soma as unidades deles.
 */
export function entregaInauguracaoPorAno(
  numeros: ReadonlySet<string>,
  etapas: Etapas[],
) {
  const anos = new Map<string, EntregaInauguracaoAno>();
  const linha = (ano: string) => {
    const atual = anos.get(ano) ?? { ano, inaugurados: 0, dispensados: 0 };
    anos.set(ano, atual);
    return atual;
  };
  let aguardando = 0;
  for (const e of etapas) {
    if (!numeros.has(e.nr_convenio)) continue;
    const total = e.unidades_entregues.reduce((s, u) => s + u.quantidade, 0);
    const motivo = motivoOperacao(e);
    if (motivo === "dispensada") {
      for (const u of e.unidades_entregues)
        linha(u.data.slice(0, 4)).dispensados += u.quantidade;
    } else if (motivo === "pela_entrega") {
      for (const u of e.unidades_entregues)
        linha(u.data.slice(0, 4)).inaugurados += u.quantidade;
    } else if (motivo === "inaugurada" && e.inauguracao) {
      linha(e.inauguracao.slice(0, 4)).inaugurados += total;
    } else {
      aguardando += total;
    }
  }
  return {
    anos: [...anos.values()].sort((a, b) => a.ano.localeCompare(b.ano)),
    aguardando,
  };
}
