/** Plan Mode monitoramento-evolucao 2026-09-19 (Bloco 3) -- cobertura do
 * componente compartilhado de exclusão lógica com motivo obrigatório
 * (eventos e ações usam o mesmo). */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { ApiError } from "@/lib/api-error";
import { ConfirmarExclusaoComMotivo } from "./monitoramento-ui";

describe("ConfirmarExclusaoComMotivo", () => {
  it("bloqueia confirmação com motivo vazio e mostra erro, sem chamar onExcluir", async () => {
    const onExcluir = vi.fn();
    render(
      <ConfirmarExclusaoComMotivo
        onExcluir={onExcluir}
        onCancelar={() => {}}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar exclusão" }),
    );

    expect(screen.getByText(/mínimo 3 caracteres/)).toBeInTheDocument();
    expect(onExcluir).not.toHaveBeenCalled();
  });

  it("chama onExcluir com o motivo digitado (trim aplicado)", async () => {
    const onExcluir = vi.fn().mockResolvedValue(undefined);
    render(
      <ConfirmarExclusaoComMotivo
        onExcluir={onExcluir}
        onCancelar={() => {}}
      />,
    );

    await userEvent.type(
      screen.getByPlaceholderText(/Explique por que/),
      "  lançamento de teste  ",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar exclusão" }),
    );

    expect(onExcluir).toHaveBeenCalledWith("lançamento de teste");
  });

  it("chama onCancelar ao clicar em Cancelar", async () => {
    const onCancelar = vi.fn();
    render(
      <ConfirmarExclusaoComMotivo
        onExcluir={vi.fn()}
        onCancelar={onCancelar}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });

  it("mostra a mensagem segura do erro quando onExcluir rejeita", async () => {
    const onExcluir = vi
      .fn()
      .mockRejectedValue(
        new ApiError(
          "detalhe técnico cru",
          409,
          "Este evento já foi excluído.",
        ),
      );
    render(
      <ConfirmarExclusaoComMotivo
        onExcluir={onExcluir}
        onCancelar={() => {}}
      />,
    );

    await userEvent.type(
      screen.getByPlaceholderText(/Explique por que/),
      "motivo válido",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar exclusão" }),
    );

    expect(
      await screen.findByText("Este evento já foi excluído."),
    ).toBeInTheDocument();
  });

  it("não tem violação de acessibilidade", async () => {
    const { container } = render(
      <ConfirmarExclusaoComMotivo onExcluir={vi.fn()} onCancelar={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
