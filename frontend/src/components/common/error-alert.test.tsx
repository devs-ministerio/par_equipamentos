import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { ErrorAlert } from "./error-alert";

describe("ErrorAlert", () => {
  it("mostra a mensagem segura recebida", () => {
    render(<ErrorAlert mensagem="Não foi possível carregar os dados." />);
    expect(
      screen.getByText("Não foi possível carregar os dados."),
    ).toBeInTheDocument();
  });

  it('chama onRetry ao clicar em "Tentar novamente"', async () => {
    const onRetry = vi.fn();
    render(<ErrorAlert mensagem="Erro" onRetry={onRetry} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Tentar novamente" }),
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("não mostra botão de retry quando onRetry não é passado", () => {
    render(<ErrorAlert mensagem="Erro" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("não tem violação de acessibilidade", async () => {
    const { container } = render(
      <ErrorAlert mensagem="Erro" onRetry={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
