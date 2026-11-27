import { MetricStrip } from "@/components/common/metric-strip";
import { legendaPorContagem } from "@/lib/relatorio-legendas";

/** KPIs do recorte, no padrão do `MetricStrip`. Os números vêm dos mesmos
 * conjuntos filtrados das tabelas; não introduz consulta nem cálculo novo. */
export function RelatorioResumoCarteira({
  tiposInstrumentos,
  tiposParcerias,
  situacoesPropostas,
}: {
  tiposInstrumentos: (string | null | undefined)[];
  tiposParcerias: (string | null | undefined)[];
  situacoesPropostas: (string | null | undefined)[];
}) {
  return (
    <MetricStrip
      items={[
        {
          key: "instrumentos",
          label: "Instrumentos e programas",
          value: tiposInstrumentos.length,
          detail: legendaPorContagem(tiposInstrumentos),
        },
        {
          key: "parcerias",
          label: "Linhas de financiamento",
          value: tiposParcerias.length,
          detail: legendaPorContagem(tiposParcerias),
        },
        {
          key: "propostas",
          label: "Propostas",
          value: situacoesPropostas.length,
          detail: legendaPorContagem(situacoesPropostas),
        },
      ]}
    />
  );
}
