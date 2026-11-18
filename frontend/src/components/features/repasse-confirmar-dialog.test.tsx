import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RepasseConfirmarDialog } from "./repasse-confirmar-dialog";

describe("RepasseConfirmarDialog", () => {
  it("exige escolher integral ou parcial", async () => {
    const onConfirmar = vi.fn();
    render(
      <RepasseConfirmarDialog onFechar={vi.fn()} onConfirmar={onConfirmar} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "integral ou parcial",
    );
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it("envia o tipo e a justificativa informados", async () => {
    const onConfirmar = vi.fn().mockResolvedValue(undefined);
    render(
      <RepasseConfirmarDialog onFechar={vi.fn()} onConfirmar={onConfirmar} />,
    );
    await userEvent.click(screen.getByLabelText("Parcial"));
    await userEvent.type(
      screen.getByLabelText("Justificativa"),
      "Segunda parcela",
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() =>
      expect(onConfirmar).toHaveBeenCalledWith(
        { tipo: "parcial", justificativa: "Segunda parcela" },
        expect.anything(),
      ),
    );
  });

  it("cancelar avisa o fechamento sem confirmar", async () => {
    const onFechar = vi.fn();
    const onConfirmar = vi.fn();
    render(
      <RepasseConfirmarDialog onFechar={onFechar} onConfirmar={onConfirmar} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onFechar).toHaveBeenCalled();
    expect(onConfirmar).not.toHaveBeenCalled();
  });
});
