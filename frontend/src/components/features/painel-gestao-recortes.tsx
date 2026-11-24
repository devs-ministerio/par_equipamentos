import {
  ChipsFiltrosAtivos,
  type RecortePainel,
} from "@/components/common/chips-filtros-ativos";
import type { FiltrosMonitoramentoInterno } from "@/hooks/use-monitoramento-interno-filtros";
import { montarRecortes } from "@/lib/painel-gestao-recortes";

export type { RecortePainel };

export function PainelGestaoRecortes({
  filtros,
  recortesGraficos,
  limpar,
}: {
  filtros: FiltrosMonitoramentoInterno;
  recortesGraficos: RecortePainel[];
  limpar: () => void;
}) {
  return (
    <ChipsFiltrosAtivos
      recortes={montarRecortes(filtros, recortesGraficos)}
      limpar={limpar}
    />
  );
}
