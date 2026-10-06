import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FamiliaEquipamentoProvider } from "@/context/familia-equipamento-context";
import { SeletorEquipamento } from "./top-nav";

describe("SeletorEquipamento", () => {
  it("permite escolher uma família disponível e fechar as opções com Escape", async () => {
    const user = userEvent.setup();
    render(
      <FamiliaEquipamentoProvider>
        <SeletorEquipamento />
      </FamiliaEquipamentoProvider>,
    );

    const trigger = screen.getByRole("button", {
      name: /Selecionar equipamento/,
    });
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Mamógrafo" })).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: "Ressonância Magnética" }),
    );
    expect(trigger).toHaveTextContent("Ressonância Magnética");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });
});
