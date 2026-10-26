import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it } from "vitest";
import { DetalhesAnimados } from "./detalhes-animados";
import { Logo } from "./logo";

function Exemplo() {
  const [aberto, setAberto] = useState(false);
  return (
    <DetalhesAnimados aberto={aberto} onAbertoChange={setAberto}>
      <p>Conteúdo técnico</p>
    </DetalhesAnimados>
  );
}

describe("DetalhesAnimados", () => {
  it("monta o conteúdo só quando aberto e troca o rótulo", () => {
    render(<Exemplo />);
    expect(screen.queryByText("Conteúdo técnico")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Mais detalhes/ }));
    expect(screen.getByText("Conteúdo técnico")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Menos detalhes/ }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("não tem violação de acessibilidade", async () => {
    const { container } = render(<Exemplo />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Logo", () => {
  it("expõe o nome do sistema para leitor de tela", () => {
    render(<Logo variante="reduzido" />);
    expect(screen.getByAltText(/SISGEO/)).toBeInTheDocument();
  });
});
