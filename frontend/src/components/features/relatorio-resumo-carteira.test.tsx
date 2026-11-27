import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RelatorioResumoCarteira } from "./relatorio-resumo-carteira";

describe("RelatorioResumoCarteira", () => {
  it("mostra o total e a composição de cada fonte do recorte", () => {
    render(
      <RelatorioResumoCarteira
        tiposInstrumentos={["Convênio", "Convênio", "PERSUS I", "PERSUS II"]}
        tiposParcerias={["FAF", "FAF", "TED"]}
        situacoesPropostas={["Aprovada", "Em Elaboração"]}
      />,
    );
    expect(screen.getByText("Instrumentos e programas")).toBeVisible();
    expect(
      screen.getByText("2 CONVÊNIOS, 1 PERSUS I e 1 PERSUS II"),
    ).toBeVisible();
    expect(screen.getByText("Linhas de financiamento")).toBeVisible();
    expect(screen.getByText("2 FAFs e 1 TED")).toBeVisible();
    expect(screen.getByText("Propostas")).toBeVisible();
    expect(screen.getByText("1 aprovada e 1 em elaboração")).toBeVisible();
  });
});
