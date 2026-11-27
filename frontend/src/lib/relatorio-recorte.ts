import { TIPOS_LINHA_FINANCIAMENTO } from "@/lib/financiamento-manual";
import {
  linhaDeConvenio,
  linhaDeProposta,
  type FasesMonitoramento,
  type LinhaRelatorio,
} from "@/lib/relatorio-linhas";
import type { PropostaCandidata } from "@/services/propostas-candidatas";
import type { ConvenioUnificado } from "@/types/monitoramento";

/** Como o relatório organiza o recorte, igual às telas de Dados oficiais:
 *  - Instrumentos e programas: Convênio, TED, PERSUS I e PERSUS II;
 *  - Linhas de financiamento confirmadas: parcerias confirmadas e FAF
 *    firmados, numa lista só (o FAF que já é parceria conta uma vez);
 *  - Linhas de financiamento, propostas e solicitações (em tramitação). */
export interface RecorteRelatorio {
  instrumentos: LinhaRelatorio[];
  confirmadas: LinhaRelatorio[];
  solicitacoes: LinhaRelatorio[];
  /** Todas as linhas, na ordem: instrumentos, confirmadas, propostas. */
  linhas: LinhaRelatorio[];
  total: number;
}

export function montarRecorte(
  convenios: ConvenioUnificado[],
  parcerias: PropostaCandidata[],
  solicitacoes: PropostaCandidata[],
  fases: FasesMonitoramento,
  monitorado: string | null = null,
): RecorteRelatorio {
  const passa = (l: LinhaRelatorio) =>
    monitorado === null ||
    (monitorado === "propostas"
      ? l.grupo === "Proposta"
      : l.grupo !== "Proposta" &&
        (l.monitoramento !== null) === (monitorado === "monitorado"));
  const codigosParceria = new Set(parcerias.map((p) => p.cd_parceria));
  const ehLinha = (c: ConvenioUnificado) =>
    TIPOS_LINHA_FINANCIAMENTO.has(c.tipoContratacao ?? "");
  const instrumentos = convenios
    .filter((c) => !ehLinha(c))
    .map((c) => linhaDeConvenio(c, fases))
    .filter(passa);
  const confirmadas = [
    ...parcerias.map((p) => linhaDeProposta(p, fases, "Confirmada")),
    ...convenios
      .filter((c) => ehLinha(c) && !codigosParceria.has(c.numero))
      .map((c) => linhaDeConvenio(c, fases, "Confirmada")),
  ].filter(passa);
  const propostas = solicitacoes
    .map((p) => linhaDeProposta(p, fases))
    .filter(passa);
  return {
    instrumentos,
    confirmadas,
    solicitacoes: propostas,
    linhas: [...instrumentos, ...confirmadas, ...propostas],
    total: instrumentos.length + confirmadas.length + propostas.length,
  };
}

const ORDEM_TIPOS = ["Convênio", "TED", "PERSUS I", "PERSUS II", "FAF"];

/** Opções do filtro Contratação: cada tipo com a contagem do recorte
 *  (instrumentos, linhas confirmadas e propostas), sem aplicar o próprio filtro. */
export function opcoesContratacao(
  recorte: RecorteRelatorio,
): { value: string; label: string }[] {
  const contagem = new Map<string, number>();
  for (const l of [
    ...recorte.instrumentos,
    ...recorte.confirmadas,
    ...recorte.solicitacoes,
  ]) {
    const tipo = l.tipo ?? "Convênio";
    contagem.set(tipo, (contagem.get(tipo) ?? 0) + 1);
  }
  const posicao = (t: string) => {
    const i = ORDEM_TIPOS.indexOf(t);
    return i === -1 ? ORDEM_TIPOS.length : i;
  };
  return [...contagem.entries()]
    .sort(([a], [b]) => posicao(a) - posicao(b) || a.localeCompare(b, "pt-BR"))
    .map(([tipo, n]) => ({
      value: tipo,
      label: `${tipo.toUpperCase()} (${n})`,
    }));
}
