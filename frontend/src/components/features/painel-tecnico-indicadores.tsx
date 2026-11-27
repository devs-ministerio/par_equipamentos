import { MetricStrip } from "@/components/common/metric-strip";
import {
  JANELA_RADAR_DIAS,
  type FiltroCarteira,
} from "@/lib/painel-tecnico-filtro";
import { fmtMoeda } from "@/lib/monitoramento-format";
import type { PainelTecnico } from "@/services/painel-tecnico";

interface PropsIndicadores {
  carteira: PainelTecnico["carteira"];
  faltam: number;
  faltamAbertos: number;
  pendentes: number;
  atrasadas: number;
  concluidos: number;
  novosRadar: number;
  valorRadar: number;
  filtro: FiltroCarteira;
  semFiltroGrafico: boolean;
  alternar: (filtro: FiltroCarteira) => void;
  restaurar: () => void;
}

/** Indicadores clicáveis do Meu painel; cada um filtra a carteira. */
export function PainelTecnicoIndicadores({
  carteira: c,
  faltam,
  faltamAbertos,
  pendentes,
  atrasadas,
  concluidos,
  novosRadar,
  valorRadar,
  filtro,
  semFiltroGrafico,
  alternar,
  restaurar,
}: PropsIndicadores) {
  return (
    <MetricStrip
      items={[
        {
          key: "cobertura",
          label: "Cobertura do monitoramento",
          value:
            c.cobertura_pct == null
              ? "—"
              : `${c.cobertura_pct.toLocaleString("pt-BR")}%`,
          variant: "primary",
          detail: `${c.monitorados} de ${c.elegiveis} instrumentos monitorados`,
          onClick: restaurar,
          ativo: filtro === "todos" && semFiltroGrafico,
        },
        {
          key: "faltam",
          label: "Fora do monitoramento",
          value: faltam,
          variant: faltam > 0 ? "warning" : "success",
          detail: `${faltamAbertos} em aberto`,
          onClick: () => alternar("faltam"),
          ativo: filtro === "faltam",
        },
        {
          key: "acoes-pendentes",
          label: "Ações pendentes",
          value: pendentes,
          variant: atrasadas > 0 ? "destructive" : "success",
          detail: `${atrasadas} atrasadas`,
          onClick: () => alternar("acoes-pendentes"),
          ativo: filtro === "acoes-pendentes",
        },
        {
          key: "concluidos",
          label: "Concluídos",
          value: concluidos,
          variant: "success",
          onClick: () => alternar("concluidos"),
          ativo: filtro === "concluidos",
        },
        {
          key: "radar",
          label: "Novos Instrumentos",
          value: novosRadar,
          detail: `${fmtMoeda(valorRadar)} nos últimos ${JANELA_RADAR_DIAS} dias`,
          onClick: () => alternar("radar"),
          ativo: filtro === "radar",
        },
      ]}
    />
  );
}
