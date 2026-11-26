import type { ResumoMonitoramento } from "@/services/monitoramento-resumo";

export type Etapas = ResumoMonitoramento["etapas_por_instrumento"][number];

const DIA_MS = 86_400_000;

export function dias(de: string, ate: string): number {
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
  if (e.modo_operacao !== undefined) return e.modo_operacao === "pela_entrega";
  return (
    !e.inauguracao &&
    !e.inauguracao_dispensada &&
    e.tem_acelerador_linear &&
    e.conclusao_resultado === "integral" &&
    e.unidades_entregues.length > 0
  );
}

/** Compatibilidade com o resumo anterior ao campo de operação. */
export function motivoOperacao(e: Etapas | undefined) {
  if (!e) return null;
  if (e.modo_operacao !== undefined) return e.modo_operacao;
  if (e.inauguracao_dispensada) return "dispensada";
  if (e.inauguracao) return "inaugurada";
  return inauguracaoPelaEntrega(e) ? "pela_entrega" : null;
}

export function instrumentoEmOperacao(e: Etapas | undefined): boolean {
  return motivoOperacao(e) !== null;
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
  const motivo = motivoOperacao(e);
  if (motivo === "dispensada" || motivo === "pela_entrega") {
    for (const u of e.unidades_entregues) anos.add(u.data.slice(0, 4));
  } else if (motivo === "inaugurada" && e.inauguracao) {
    anos.add(e.inauguracao.slice(0, 4));
  }
  return anos;
}
