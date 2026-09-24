import { MetricStrip } from "@/components/common/metric-strip";
import { fmtMoeda } from "@/lib/monitoramento-format";

export function DadosOficiaisMetricas({
  instrumentos,
  monitorados,
  concluidos,
  valorGlobal,
  desembolsado,
  equipamentos,
  soMonitorados,
  onToggleMonitorados,
}: {
  instrumentos: number;
  monitorados: number;
  concluidos: number;
  valorGlobal: number;
  desembolsado: number;
  equipamentos: number;
  soMonitorados: boolean;
  onToggleMonitorados: () => void;
}) {
  return (
    <div className="mb-5">
      <MetricStrip
        items={[
          { key: "instrumentos", label: "Instrumentos", value: instrumentos },
          {
            key: "monitorados",
            label: "Monitorados",
            value: monitorados,
            variant: "success",
            onClick: onToggleMonitorados,
            ativo: soMonitorados,
          },
          {
            key: "concluidos",
            label: "Concluídos",
            value: concluidos,
            variant: "success",
          },
          {
            key: "global",
            label: "Valor global",
            value: fmtMoeda(valorGlobal),
          },
          {
            key: "desembolsado",
            label: "Desembolsado",
            value: fmtMoeda(desembolsado),
            variant: "success",
          },
          {
            key: "equipamentos",
            label: "Itens de equipamento",
            value: equipamentos,
          },
        ]}
      />
    </div>
  );
}
