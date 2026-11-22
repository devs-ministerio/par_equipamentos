import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-error";
import { criarMarcosInteracao } from "@/test-fixtures/monitoramento-interacoes";
import { MonitoramentoInternoLancamentos } from "./monitoramento-interno-lancamentos";

function criarProps() {
  return {
    marcos: criarMarcosInteracao(),
    podeEditar: true,
    onRegistrarEvento: vi.fn().mockResolvedValue(undefined),
    onCriarAcao: vi.fn().mockResolvedValue(undefined),
  };
}

describe("lançamentos do cartão Cronograma", () => {
  it("sem permissão não oferece os botões", () => {
    render(
      <MonitoramentoInternoLancamentos {...criarProps()} podeEditar={false} />,
    );
    expect(
      screen.queryByRole("button", { name: "Evento" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ação" }),
    ).not.toBeInTheDocument();
  });

  it("registra evento pela janela, preserva o conteúdo na falha e fecha no sucesso", async () => {
    const props = criarProps();
    props.onRegistrarEvento.mockRejectedValueOnce(
      new ApiError("Fonte indisponível", 503),
    );
    render(<MonitoramentoInternoLancamentos {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Evento" }));
    await userEvent.selectOptions(screen.getByLabelText("Marco"), "5");
    await userEvent.type(
      screen.getByLabelText("Observação"),
      "Registro sintético",
    );
    const enviar = () =>
      userEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Registrar evento",
        }),
      );
    await enviar();
    await waitFor(() =>
      expect(screen.getByLabelText("Observação")).toHaveValue(
        "Registro sintético",
      ),
    );
    await enviar();
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(props.onRegistrarEvento).toHaveBeenLastCalledWith(
      expect.objectContaining({
        marcoId: "5",
        observacao: "Registro sintético",
      }),
    );
  });

  it("não oferece previsão nem dispensa de inauguração", async () => {
    render(<MonitoramentoInternoLancamentos {...criarProps()} />);
    await userEvent.click(screen.getByRole("button", { name: "Evento" }));
    const marco = screen.getByLabelText("Marco");
    for (const nome of ["Previsão de inauguração", "Inauguração dispensada"])
      expect(
        within(marco).queryByRole("option", { name: nome }),
      ).not.toBeInTheDocument();
  });

  it("registra ação pela janela e valida a descrição", async () => {
    const props = criarProps();
    render(<MonitoramentoInternoLancamentos {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Ação" }));
    const janela = screen.getByRole("dialog");
    await userEvent.click(
      within(janela).getByRole("button", { name: "Registrar" }),
    );
    expect(within(janela).getByRole("alert")).toHaveTextContent(
      "Descreva o que precisa ser feito.",
    );
    expect(props.onCriarAcao).not.toHaveBeenCalled();
    await userEvent.type(
      within(janela).getByLabelText("Descrição"),
      "  Conferir entrega  ",
    );
    await userEvent.type(within(janela).getByLabelText("Prazo"), "2026-11-01");
    await userEvent.selectOptions(
      within(janela).getByLabelText("Responsável"),
      "Convenente",
    );
    await userEvent.click(
      within(janela).getByRole("button", { name: "Registrar" }),
    );
    await waitFor(() =>
      expect(props.onCriarAcao).toHaveBeenCalledExactlyOnceWith({
        descricao: "Conferir entrega",
        dataPrevista: "2026-11-01",
        responsavel: "Convenente",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
