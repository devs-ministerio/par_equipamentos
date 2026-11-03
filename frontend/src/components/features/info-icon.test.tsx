import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InfoIcon } from "./info-icon";

describe("InfoIcon", () => {
  it("desenha o popup fora do contêiner com overflow oculto", () => {
    const { container } = render(
      <div style={{ overflow: "hidden" }}>
        <InfoIcon>Explicação completa</InfoIcon>
      </div>,
    );
    fireEvent.mouseEnter(container.querySelector("span")!);
    const dica = screen.getByRole("tooltip");
    expect(dica).toHaveTextContent("Explicação completa");
    expect(container.contains(dica)).toBe(false);
  });

  it("clicar no ícone não aciona o elemento que o contém", async () => {
    const aoClicar = vi.fn();
    render(
      <button type="button" onClick={aoClicar}>
        Indicador
        <InfoIcon>Ajuda</InfoIcon>
      </button>,
    );
    await userEvent.click(screen.getByLabelText("Mais informações"));
    expect(aoClicar).not.toHaveBeenCalled();
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("liga o texto ao disparador e fecha com Escape", async () => {
    render(<InfoIcon>Ajuda</InfoIcon>);
    const gatilho = screen.getByLabelText("Mais informações");
    gatilho.focus();
    const dica = await screen.findByRole("tooltip");
    expect(gatilho).toHaveAttribute("aria-describedby", dica.id);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
