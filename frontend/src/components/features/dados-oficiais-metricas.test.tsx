import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DadosOficiaisMetricas } from "./dados-oficiais-metricas";

function montar(
  global: { valor: number | null; informados: number; total: number },
  desembolsado = global,
) {
  render(
    <DadosOficiaisMetricas
      instrumentos={global.total}
      monitorados={0}
      concluidos={0}
      equipamentos={0}
      valorGlobal={global}
      desembolsado={desembolsado}
    />,
  );
}

describe("DadosOficiaisMetricas: totais financeiros", () => {
  it("sem nenhum valor informado, não mostra R$ 0", () => {
    montar({ valor: null, informados: 0, total: 50 });
    expect(screen.getAllByText("Sem valor informado")).toHaveLength(2);
    expect(screen.queryByText(/R\$\s*0/)).not.toBeInTheDocument();
  });

  it("recorte misto mostra a soma conhecida e a cobertura", () => {
    montar({ valor: 1500, informados: 2, total: 5 });
    expect(
      screen.getAllByText("valor conhecido de 2 de 5 instrumentos").length,
    ).toBeGreaterThan(0);
  });

  it("zero informado e válido continua zero", () => {
    montar({ valor: 0, informados: 3, total: 3 });
    expect(screen.getAllByText(/^R\$[\s\u00a0]*0$/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/valor conhecido de/)).not.toBeInTheDocument();
  });
});
