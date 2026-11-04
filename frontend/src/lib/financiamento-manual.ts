import type { InstrumentoEquipamento } from "@/services/monitoramento-instrumentos";

export const TIPOS_LINHA_FINANCIAMENTO = new Set(["FAF", "TED"]);

/** Parceria confirmada no TransfereGov novo é FAF. O valor gravado continua
 * "Parceria TransfereGov" (chave técnica dos jobs); a tela mostra FAF. */
export function rotuloTipoContratacao(tipo: string | null | undefined) {
  return tipo === "Parceria TransfereGov" ? "FAF" : tipo;
}

type PropostaChave = { cd_parceria: string | null; id_proposta: number };

/** FAF e TED vêm de carga manual, sem proposta no TransfereGov. Entram na
 * lista de Linhas de financiamento junto das parcerias confirmadas, exceto
 * os que já correspondem a uma proposta pelo número. */
export function instrumentosManuaisFinanciamento(
  instrumentos: InstrumentoEquipamento[],
  propostas: PropostaChave[],
): InstrumentoEquipamento[] {
  const numeros = new Set(
    propostas.flatMap((p) => [p.cd_parceria, String(p.id_proposta)]),
  );
  return instrumentos.filter(
    (i) =>
      TIPOS_LINHA_FINANCIAMENTO.has(i.tipo_contratacao ?? "") &&
      !numeros.has(i.nr_convenio),
  );
}

/** Instrumentos já monitorados no mesmo CNES. É um indício de que o
 * financiamento pode ser o mesmo, nunca prova de identidade. */
export function candidatosConciliacao(
  instrumentos: InstrumentoEquipamento[],
  cnes: string | null,
  nrProprio: string,
): InstrumentoEquipamento[] {
  if (!cnes) return [];
  return instrumentos.filter(
    (i) => i.cnes === cnes && i.nr_convenio !== nrProprio,
  );
}
