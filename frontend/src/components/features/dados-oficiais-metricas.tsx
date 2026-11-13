import { MetricStrip } from "@/components/common/metric-strip";
import { fmtMoeda } from "@/lib/monitoramento-format";
import type { TotalFinanceiro } from "@/hooks/use-dados-oficiais-resumo";

function totalFinanceiro(total: TotalFinanceiro) {
  if (total.valor === null)
    return { value: "Sem valor informado", detail: undefined };
  return {
    value: fmtMoeda(total.valor),
    detail:
      total.informados < total.total
        ? `valor conhecido de ${total.informados} de ${total.total} instrumentos`
        : undefined,
  };
}

export function DadosOficiaisMetricas({
  instrumentos,
  monitorados,
  concluidos,
  valorGlobal,
  desembolsado,
  equipamentos,
}: {
  instrumentos: number;
  monitorados: number;
  concluidos: number;
  valorGlobal: TotalFinanceiro;
  desembolsado: TotalFinanceiro;
  equipamentos: number;
}) {
  return (
    <div className="mb-5">
      <MetricStrip
        compactMobile
        balancedColumns
        items={[
          { key: "instrumentos", label: "Instrumentos", value: instrumentos },
          {
            key: "monitorados",
            label: "Monitorados",
            value: monitorados,
            variant: "success",
          },
          {
            key: "concluidos",
            label: "Concluídos",
            value: concluidos,
            variant: "success",
          },
          {
            key: "equipamentos",
            label: "Itens de equipamento",
            value: equipamentos,
          },
          {
            key: "global",
            label: "Valor global",
            ...totalFinanceiro(valorGlobal),
            mobileFullWidth: true,
            wideValue: true,
          },
          {
            key: "desembolsado",
            label: "Desembolsado",
            ...totalFinanceiro(desembolsado),
            variant: "success",
            mobileFullWidth: true,
            wideValue: true,
          },
        ]}
      />
    </div>
  );
}
