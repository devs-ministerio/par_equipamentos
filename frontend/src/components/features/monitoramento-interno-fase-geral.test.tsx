import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MonitoramentoInternoFaseGeral } from "./monitoramento-interno-fase-geral";

afterEach(cleanup);

describe("indicador da fase geral", () => {
  it("mostra as 7 fases oficiais e marca a atual", () => {
    render(<MonitoramentoInternoFaseGeral faseAtual="Em aquisição" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
    expect(
      screen.getByText("Em aquisição", { selector: "strong" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Em aquisição", { selector: "strong" }),
    ).toBeInTheDocument();
    const atual = screen
      .getAllByRole("listitem")
      .find((li) => li.getAttribute("aria-current") === "step")!;
    expect(atual.querySelector(".rounded-full")).toHaveClass("bg-primary");
  });

  it("representa a conclusão como feita", () => {
    render(<MonitoramentoInternoFaseGeral faseAtual="Concluído" />);
    const atual = screen
      .getAllByRole("listitem")
      .find((li) => li.getAttribute("aria-current") === "step")!;
    const indicador = atual.querySelector(".rounded-full")!;
    expect(indicador).toHaveTextContent("✓");
    expect(indicador).toHaveClass("bg-success");
  });

  it("sem fase informada começa em Acompanhamento iniciado", () => {
    render(<MonitoramentoInternoFaseGeral faseAtual={undefined} />);
    expect(
      screen.getByText("Acompanhamento iniciado", { selector: "strong" }),
    ).toBeInTheDocument();
  });
});
