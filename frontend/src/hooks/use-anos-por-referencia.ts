import { useCallback, useMemo } from "react";
import type { ResumoMonitoramento } from "@/services/monitoramento-resumo";
import { anosEmOperacao } from "@/lib/painel-gestao-andamento";
import type { InstrumentoMonitoramentoFiltravel } from "@/lib/monitoramento-filtros-instrumento";
import {
  anosPorReferencia,
  type DataDeInauguracao,
  type ReferenciaPeriodo,
} from "@/lib/referencia-periodo-painel";

/** Anos de cada instrumento conforme a referência do período (ano do instrumento, operação ou inauguração). */
export function useAnosPorReferencia(
  referencia: ReferenciaPeriodo,
  inauguracoes: readonly DataDeInauguracao[] | null,
  etapasDeOperacao:
    | readonly ResumoMonitoramento["etapas_por_instrumento"][number][]
    | null,
) {
  const anosPorInstrumento = useMemo(() => {
    if (referencia === "inicio_operacao") {
      return new Map(
        (etapasDeOperacao ?? []).map((etapa) => [
          etapa.nr_convenio,
          Array.from(anosEmOperacao(etapa), Number),
        ]),
      );
    }
    return new Map(
      Array.from(
        anosPorReferencia(referencia, inauguracoes ?? []),
        ([numero, ano]) => [numero, [ano]],
      ),
    );
  }, [referencia, inauguracoes, etapasDeOperacao]);
  const porEvento = referencia !== "ano_instrumento";
  const anosDe = useCallback(
    (instrumento: InstrumentoMonitoramentoFiltravel) =>
      porEvento
        ? (anosPorInstrumento.get(instrumento.nr_convenio) ?? [])
        : instrumento.ano_instrumento == null
          ? []
          : [instrumento.ano_instrumento],
    [porEvento, anosPorInstrumento],
  );
  return { anosDe, porEvento };
}
