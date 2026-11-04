import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DistribuicaoHorizontal } from "./monitoramento-painel-visuals";

const itens = Array.from({ length: 9 }, (_, i) => ({
  rotulo: `Categoria ${i + 1}`,
  quantidade: 10 - i,
}));

describe("DistribuicaoHorizontal", () => {
  it("indica o que foi cortado e oferece Ver todos", async () => {
    render(<DistribuicaoHorizontal itens={itens} limite={7} />);
    expect(screen.queryByText("Categoria 8")).not.toBeInTheDocument();
    expect(
      screen.getByText(/\+ 2 outras categorias \(5 no total\)/),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Ver todos" }));
    expect(screen.getByText("Categoria 9")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Mostrar menos" }),
    );
    expect(screen.queryByText("Categoria 9")).not.toBeInTheDocument();
  });

  it("sem corte não mostra controles", () => {
    render(<DistribuicaoHorizontal itens={itens.slice(0, 3)} limite={7} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
