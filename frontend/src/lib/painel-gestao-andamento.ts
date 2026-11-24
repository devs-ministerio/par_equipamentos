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
    const e = porNumero.get(numero);
    if (e?.inauguracao) contagem.Realizada += 1;
    else if (e?.inauguracao_dispensada) contagem.Dispensada += 1;
    else if (numerosComPrevisao.has(numero)) contagem.Prevista += 1;
    else contagem["Sem registro"] += 1;
  }
  return contagem;
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

export const FAIXAS_PARADOS = [
  { rotulo: "Até 30 dias", max: 30, cor: "var(--success)" },
  { rotulo: "31 a 60", max: 60, cor: "var(--primary)" },
  { rotulo: "61 a 90", max: 90, cor: "var(--warning)" },
  { rotulo: "Mais de 90", max: Infinity, cor: "var(--destructive)" },
] as const;

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
    if (i.fase_atual === "Concluído") continue;
    const quando = ultima.get(i.nr_convenio);
    if (!quando) {
      semAtividade += 1;
      continue;
    }
    const d = Math.floor((agora - new Date(quando).getTime()) / DIA_MS);
    const faixa = faixas.find((f) => d <= f.max) ?? faixas[faixas.length - 1];
    faixa.quantidade += 1;
  }
  return { faixas, semAtividade };
}

export interface EntregaUf {
  uf: string;
  planejado: number;
  entregue: number;
}

/** Equipamentos planejados e entregues por UF do instrumento. */
export function entregaPorUf(
  instrumentos: InstrumentoEquipamento[],
  linhas: EquipamentoInstrumentoResumo[],
): EntregaUf[] {
  const ufPorNumero = new Map(
    instrumentos.map((i) => [i.nr_convenio, i.uf ?? "—"]),
  );
  const mapa = new Map<string, EntregaUf>();
  for (const l of linhas) {
    const uf = ufPorNumero.get(l.nr_convenio);
    if (uf === undefined || l.planejado <= 0) continue;
    const atual = mapa.get(uf) ?? { uf, planejado: 0, entregue: 0 };
    atual.planejado += l.planejado;
    atual.entregue += l.entregue;
    mapa.set(uf, atual);
  }
  return [...mapa.values()].sort(
    (a, b) => b.planejado - a.planejado || a.uf.localeCompare(b.uf),
  );
}
