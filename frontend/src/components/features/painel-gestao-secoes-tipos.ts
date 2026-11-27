import type { FiltrosMonitoramentoInterno } from "@/hooks/use-monitoramento-interno-filtros";
import type {
  FiltroLocal,
  FiltrosLocais,
  PainelDerivado,
} from "@/lib/painel-gestao-derivados";
import type { ReferenciaPeriodo } from "@/lib/referencia-periodo-painel";

export interface PropsSecaoPainel {
  d: PainelDerivado;
  filtros: FiltrosMonitoramentoInterno;
  locais: FiltrosLocais;
  alternarLocal: (campo: FiltroLocal, valor: string) => void;
}

export interface PropsSecaoEvolucao extends Omit<PropsSecaoPainel, "filtros"> {
  anoSelecionado: (referencia: ReferenciaPeriodo) => string | null;
  alternarAno: (referencia: ReferenciaPeriodo, ano: string) => void;
}
