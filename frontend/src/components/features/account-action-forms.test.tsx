import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AccountActionForm } from "./account-action-forms";

vi.mock("@/services/auth", () => ({
  ativarConta: vi.fn(),
  redefinirSenha: vi.fn(),
  solicitarRecuperacao: vi.fn(),
}));

function renderForm() {
  return render(
    <MemoryRouter>
      <AccountActionForm mode="activate" token="abc" onConcluido={vi.fn()} />
    </MemoryRouter>,
  );
}

describe("AccountActionForm", () => {
  it("mostra a regra de tamanho antes de digitar e acompanha a contagem", async () => {
    renderForm();
    const regra = screen.getByText(/Mínimo de 10 caracteres/);
    expect(regra).toHaveTextContent("0/10");
    await userEvent.type(screen.getByPlaceholderText("Nova senha"), "segredo");
    expect(regra).toHaveTextContent("7/10");
  });

  it("botão de mostrar senha continua lá depois de sair do campo", async () => {
    renderForm();
    const campo = screen.getByPlaceholderText("Nova senha");
    await userEvent.type(campo, "segredo-123");
    await userEvent.tab(); // sai do campo
    const [botao] = screen.getAllByRole("button", { name: "Mostrar senha" });
    expect(botao).toBeVisible();
    await userEvent.click(botao);
    expect(campo).toHaveAttribute("type", "text");
    expect(
      screen.getAllByRole("button", { name: "Ocultar senha" }).length,
    ).toBe(1);
  });
});
