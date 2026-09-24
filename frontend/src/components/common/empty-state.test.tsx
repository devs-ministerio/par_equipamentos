import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("mostra título e descrição", () => {
    render(
      <EmptyState
        titulo="Nada encontrado"
        descricao="Ajuste os filtros e tente de novo."
      />,
    );
    expect(screen.getByText("Nada encontrado")).toBeInTheDocument();
    expect(
      screen.getByText("Ajuste os filtros e tente de novo."),
    ).toBeInTheDocument();
  });

  it("mostra a ação quando fornecida", () => {
    render(
      <EmptyState
        titulo="Nada encontrado"
        acao={<button type="button">Limpar filtros</button>}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Limpar filtros" }),
    ).toBeInTheDocument();
  });

  it("não tem violação de acessibilidade", async () => {
    const { container } = render(
      <EmptyState titulo="Nada encontrado" descricao="Descrição" />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
