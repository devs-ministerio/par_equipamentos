import type {
  ResumoMonitoramento,
  EquipamentoInstrumentoResumo,
} from "@/services/monitoramento-resumo";
import type { InstrumentoEquipamento } from "@/services/monitoramento-instrumentos";

type Etapas = ResumoMonitoramento["etapas_por_instrumento"][number];

const DIA_MS = 86_400_000;

function dias(de: string, ate: string): number {
  return Math.round(
    (new Date(`${ate}T00:00:00`).getTime() -
      new Date(`${de}T00:00:00`).getTime()) /
      DIA_MS,
  );
}

export type SituacaoInauguracao =
  | "Realizada"
  | "Prevista"
  | "Dispensada"
  | "Sem registro";

/**
 * Acelerador linear concluído sem registro de inauguração: só aceleradores têm data de inauguração lançada,
 * então a data da entrega vale como inauguração. Vale só no cálculo do painel; nada é gravado.
 */
export function inauguracaoPelaEntrega(e: Etapas): boolean {
  return (
    !e.inauguracao &&
    !e.inauguracao_dispensada &&
    e.tem_acelerador_linear &&
    e.conclusao_resultado === "integral" &&
    e.unidades_entregues.length > 0
  );
}

/**
 * Equipamentos entregues do instrumento já estão em operação: inauguração dispensada, realizada com o
 * instrumento 100% concluído, ou acelerador linear concluído (data da entrega vale como inauguração).
 * Os demais entregues ainda precisam de inauguração.
 */
export function instrumentoEmOperacao(e: Etapas | undefined): boolean {
  if (!e) return false;
  return (
    e.inauguracao_dispensada ||
    inauguracaoPelaEntrega(e) ||
    (!!e.inauguracao && e.conclusao_resultado === "integral")
  );
}

/** Situação da inauguração de cada instrumento: realizada, prevista, dispensada ou sem registro. */
export function situacaoInauguracao(
  numeros: ReadonlySet<string>,
  etapas: Etapas[],
  numerosComPrevisao: ReadonlySet<string>,
): Record<SituacaoInauguracao, number> {
  const contagem: Record<SituacaoInauguracao, number> = {
    Realizada: 0,
    Prevista: 0,
    Dispensada: 0,
    "Sem registro": 0,
  };
  const porNumero = new Map(etapas.map((e) => [e.nr_convenio, e]));
  for (const numero of numeros) {
    contagem[
      situacaoDoInstrumento(
        porNumero.get(numero),
        numerosComPrevisao.has(numero),
      )
    ] += 1;
  }
  return contagem;
}

/** Situação da inauguração de um instrumento (a mesma regra do gráfico de rosca). */
export function situacaoDoInstrumento(
  e: Etapas | undefined,
  temPrevisao: boolean,
): SituacaoInauguracao {
  if (e?.inauguracao || (e && inauguracaoPelaEntrega(e))) return "Realizada";
  if (e?.inauguracao_dispensada) return "Dispensada";
  return temPrevisao ? "Prevista" : "Sem registro";
}

/** Anos em que as unidades do instrumento entram em operação (mesma regra do gráfico por ano). */
export function anosEmOperacao(e: Etapas | undefined): Set<string> {
  const anos = new Set<string>();
  if (!e) return anos;
  if (e.inauguracao_dispensada || inauguracaoPelaEntrega(e)) {
    for (const u of e.unidades_entregues) anos.add(u.data.slice(0, 4));
  } else if (e.inauguracao && e.conclusao_resultado === "integral") {
    anos.add(e.inauguracao.slice(0, 4));
  }
  return anos;
}

export interface PrazoMedio {
  rotulo: string;
  dias: number;
  instrumentos: number;
}

const INTERVALOS: Array<{
  rotulo: string;
  de: keyof Etapas;
  ate: keyof Etapas;
}> = [
  { rotulo: "Publicação → entrega", de: "publicacao", ate: "entrega" },
  { rotulo: "Entrega → inauguração", de: "entrega", ate: "inauguracao" },
  { rotulo: "Entrega → conclusão", de: "entrega", ate: "conclusao" },
  { rotulo: "Publicação → conclusão", de: "publicacao", ate: "conclusao" },
];

/** Média de dias entre etapas, só dos instrumentos com as duas datas (intervalo negativo é descartado). */
export function prazosMedios(
  numeros: ReadonlySet<string>,
  etapas: Etapas[],
): PrazoMedio[] {
  return INTERVALOS.map(({ rotulo, de, ate }) => {
    const valores = etapas
      .filter((e) => numeros.has(e.nr_convenio))
      .flatMap((e) => {
        const inicio = e[de];
        const fim = e[ate];
        if (typeof inicio !== "string" || typeof fim !== "string") return [];
        const d = dias(inicio, fim);
        return d >= 0 ? [d] : [];
      });
    return {
      rotulo,
      dias: valores.length
        ? Math.round(valores.reduce((s, v) => s + v, 0) / valores.length)
        : 0,
      instrumentos: valores.length,
    };
  }).filter((p) => p.instrumentos > 0);
}

/** Instrumentos que entram na média de um intervalo (têm as duas datas, em ordem). */
export function instrumentosDoPrazo(
  rotulo: string,
  numeros: ReadonlySet<string>,
  etapas: Etapas[],
): Set<string> {
  const intervalo = INTERVALOS.find((i) => i.rotulo === rotulo);
  const resultado = new Set<string>();
  if (!intervalo) return resultado;
  for (const e of etapas) {
    if (!numeros.has(e.nr_convenio)) continue;
    const inicio = e[intervalo.de];
    const fim = e[intervalo.ate];
    if (
      typeof inicio === "string" &&
      typeof fim === "string" &&
      dias(inicio, fim) >= 0
    )
      resultado.add(e.nr_convenio);
  }
  return resultado;
}

export const FAIXAS_PARADOS = [
  { rotulo: "Até 30 dias", max: 30, cor: "var(--success)" },
  { rotulo: "31 a 60", max: 60, cor: "var(--primary)" },
  { rotulo: "61 a 90", max: 90, cor: "var(--warning)" },
  { rotulo: "Mais de 90", max: Infinity, cor: "var(--destructive)" },
] as const;

export const ROTULO_SEM_LANCAMENTO = "Sem lançamento";

/** Faixa de tempo sem atualização do instrumento; `null` para concluído, "Sem lançamento" se nunca houve. */
export function faixaDeAtualizacao(
  faseAtual: string | null | undefined,
  ultimaAtividadeEm: string | null | undefined,
  agora = Date.now(),
): string | null {
  if (faseAtual === "Concluído") return null;
  if (!ultimaAtividadeEm) return ROTULO_SEM_LANCAMENTO;
  const d = Math.floor(
    (agora - new Date(ultimaAtividadeEm).getTime()) / DIA_MS,
  );
  return (FAIXAS_PARADOS.find((f) => d <= f.max) ?? FAIXAS_PARADOS[3]).rotulo;
}

/** Instrumentos não concluídos por tempo desde o último lançamento (evento ou ação). */
export function instrumentosParados(
  instrumentos: InstrumentoEquipamento[],
  indicadores: ResumoMonitoramento["indicadores_por_instrumento"],
  agora = Date.now(),
) {
  const ultima = new Map(
    indicadores.map((i) => [i.nr_convenio, i.ultima_atividade_em]),
  );
  const faixas = FAIXAS_PARADOS.map((f) => ({ ...f, quantidade: 0 }));
  let semAtividade = 0;
  for (const i of instrumentos) {
    const rotulo = faixaDeAtualizacao(
      i.fase_atual,
      ultima.get(i.nr_convenio),
      agora,
    );
    if (rotulo === null) continue;
    if (rotulo === ROTULO_SEM_LANCAMENTO) semAtividade += 1;
    else faixas.find((f) => f.rotulo === rotulo)!.quantidade += 1;
  }
  return { faixas, semAtividade };
}

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
 * - inauguração realizada e instrumento 100% concluído: todas as unidades entram no ano da inauguração;
 * - acelerador linear concluído sem registro: cada unidade entra no ano da entrega (vale como inauguração).
 * Instrumentos que ainda precisam de inauguração ou conclusão não entram; `aguardando` soma as unidades deles.
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
    if (e.inauguracao_dispensada) {
      for (const u of e.unidades_entregues)
        linha(u.data.slice(0, 4)).dispensados += u.quantidade;
    } else if (inauguracaoPelaEntrega(e)) {
      for (const u of e.unidades_entregues)
        linha(u.data.slice(0, 4)).inaugurados += u.quantidade;
    } else if (e.inauguracao && e.conclusao_resultado === "integral") {
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
