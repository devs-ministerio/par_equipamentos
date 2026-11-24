import { CalendarRange } from "lucide-react";
import type { Controle } from "@/components/common/controles-filtro";
import { CampoSelect } from "./painel-gestao-filtros-campos";
import type {
  FiltrosRelatorio,
  OpcoesRelatorio,
} from "./relatorio-filtros-controles";

/** Controle "Período": intervalo de anos do instrumento. */
export function periodoRelatorio(
  f: FiltrosRelatorio,
  o: OpcoesRelatorio,
): Controle {
  return {
    rotulo: "Período",
    icone: CalendarRange,
    ativo: !!(f.anoInicio || f.anoFim),
    conteudo: () => (
      <div className="grid grid-cols-2 gap-2">
        <CampoSelect
          rotulo="Ano inicial"
          value={f.anoInicio ?? ""}
          onChange={(e) => f.setAnoInicio(e.target.value || null)}
        >
          <option value="">Sem início</option>
          {o.ano
            .filter(
              ({ value }) => !f.anoFim || Number(value) <= Number(f.anoFim),
            )
            .map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
        </CampoSelect>
        <CampoSelect
          rotulo="Ano final"
          value={f.anoFim ?? ""}
          onChange={(e) => f.setAnoFim(e.target.value || null)}
        >
          <option value="">Sem fim</option>
          {o.ano
            .filter(
              ({ value }) =>
                !f.anoInicio || Number(value) >= Number(f.anoInicio),
            )
            .map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
        </CampoSelect>
      </div>
    ),
  };
}
