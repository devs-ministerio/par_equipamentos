import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RelatorioResumoCarteira } from "./relatorio-resumo-carteira";

describe("RelatorioResumoCarteira", () => {
  it("apresenta as três fontes que compõem o recorte e o valor dos instrumentos", () => {
    render(
      <RelatorioResumoCarteira
        instrumentos={12}
        valorInstrumentos={1_250_000}
        parcerias={3}
        propostas={7}
      />,
    );

    expect(screen.getByRole("region", { name: "Resumo do recorte" })).toBeVisible();
    expect(screen.getByText("Instrumentos e programas")).toBeVisible();
    expect(screen.getByText("Parcerias confirmadas")).toBeVisible();
    expect(screen.getByText("Propostas em tramitação")).toBeVisible();
    expect(screen.getByText(/R\$\s*1\.250\.000/)).toBeVisible();
  });
});
