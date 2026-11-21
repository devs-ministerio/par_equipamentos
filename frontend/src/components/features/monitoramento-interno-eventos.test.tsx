import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-error";
import { criarEventoTeste } from "@/test-fixtures/monitoramento-hooks";
import { criarMarcosInteracao } from "@/test-fixtures/monitoramento-interacoes";
import { MonitoramentoInternoEventos } from "./monitoramento-interno-eventos";

function criarProps() {
  return {
    marcos: criarMarcosInteracao(),
    eventos: [
      criarEventoTeste({
        marco_id: 1,
        fase_geral_id: null,
        observacao: "Evento sintético",
      }),
    ],
    podeEditar: true,
    onEditar: vi.fn().mockResolvedValue(undefined),
    onExcluir: vi.fn().mockResolvedValue(undefined),
  };
}

describe("interação da timeline de eventos", () => {
  it("vazio sem permissão mantém histórico legível", () => {
    // Arrange
    const props = criarProps();
    render(
      <MonitoramentoInternoEventos
        {...props}
        eventos={[]}
        podeEditar={false}
      />,
    );
    // Act / Assert
    expect(
      screen.getByText("Nenhum evento lançado ainda."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Editar" }),
    ).not.toBeInTheDocument();
  });

  it("evento que vem de uma entrega não oferece Editar nem Excluir", () => {
    const props = criarProps();
    render(
      <MonitoramentoInternoEventos
        {...props}
        eventos={[
          criarEventoTeste({
            marco_id: 1,
            fase_geral_id: null,
            observacao: "Da entrega",
            gerado_por_entrega_id: 7,
          }),
        ]}
      />,
    );
    expect(screen.getByText("Vem da entrega")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Editar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Excluir" }),
    ).not.toBeInTheDocument();
  });

  it("ordena pelo lançamento mais recente e mostra ocorrência e previsão separadas", () => {
    // Arrange
    const props = criarProps();
    props.eventos = [
      criarEventoTeste({
        id: 1,
        marco_id: 1,
        data_ocorrencia: "2026-01-01",
        created_at: "2026-01-02T10:00:00Z",
        observacao: "Ordem ocorrência",
      }),
      criarEventoTeste({
        id: 2,
        marco_id: 2,
        data_ocorrencia: null,
        data_prevista: "2026-02-01",
        created_at: "2026-02-02T10:00:00Z",
        observacao: "Ordem previsão",
      }),
      criarEventoTeste({
        id: 3,
        marco_id: 999,
        data_ocorrencia: null,
        created_at: "2026-03-01T10:00:00Z",
        observacao: "Ordem criação",
      }),
    ];
    // Act
    render(<MonitoramentoInternoEventos {...props} podeEditar={false} />);
    // Assert
    expect(screen.getAllByText(/^Ordem /).map((n) => n.textContent)).toEqual([
      "Ordem criação",
      "Ordem previsão",
      "Ordem ocorrência",
    ]);
    expect(props.eventos.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(screen.getByText("Marco 999")).toBeInTheDocument();
    expect(screen.getByText("Ocorreu 01/01/2026")).toBeInTheDocument();
    expect(screen.getByText("Prev. 01/02/2026")).toBeInTheDocument();
    expect(screen.getAllByText(/Autor não registrado/)).toHaveLength(3);
  });

  it("expõe dados de licença e autor sem perder documento ou validade", () => {
    // Arrange
    const props = criarProps();
    props.eventos = [
      criarEventoTeste({
        marco_id: 3,
        numero_documento: "000123ABC",
        status_regulatorio: "Deferido",
        data_validade: "2027-12-31",
        autor_nome: "Pessoa sintética",
      }),
    ];
    // Act
    render(<MonitoramentoInternoEventos {...props} />);
    // Assert
    expect(screen.getByText(/Licença de operação/)).toHaveTextContent(
      "000123ABC",
    );
    expect(screen.getByText("Deferido")).toBeInTheDocument();
    expect(screen.getByText("Validade: 31/12/2027")).toBeInTheDocument();
    expect(
      screen.getByText(/Lançado por Pessoa sintética/),
    ).toBeInTheDocument();
  });

  it("correção regulatória mantém marco fixo e campos completos; falha mantém o form", async () => {
    // Arrange
    const props = criarProps();
    props.eventos = [
      criarEventoTeste({
        marco_id: 3,
        data_prevista: "2026-12-01",
        status_regulatorio: "Em análise",
        numero_documento: "0000123",
        data_validade: "2027-12-31",
        observacao: "Texto anterior",
      }),
    ];
    props.onEditar.mockRejectedValueOnce(new ApiError("Conflito", 409));
    render(<MonitoramentoInternoEventos {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    const form = screen
      .getByRole("button", { name: "Salvar correção" })
      .closest("form")!;
    // Act / Assert
    expect(
      within(form).queryByRole("combobox", { name: "Marco" }),
    ).not.toBeInTheDocument();
    expect(within(form).getByLabelText("Data da licença")).toHaveValue(
      "2026-10-19",
    );
    expect(within(form).getByLabelText("Data prevista")).toHaveValue(
      "2026-12-01",
    );
    expect(within(form).getByLabelText("Status regulatório")).toHaveValue(
      "Em análise",
    );
    expect(
      within(form).getByLabelText("Nº matrícula/licença/processo/SCRA"),
    ).toHaveValue("0000123");
    expect(within(form).getByLabelText("Data de validade")).toHaveValue(
      "2027-12-31",
    );
    await userEvent.clear(within(form).getByLabelText("Observação"));
    await userEvent.type(
      within(form).getByLabelText("Observação"),
      "Texto corrigido",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar correção" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Salvar correção" }),
      ).toBeEnabled(),
    );
    expect(within(form).getByLabelText("Observação")).toHaveValue(
      "Texto corrigido",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar correção" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Salvar correção" }),
      ).not.toBeInTheDocument(),
    );
    expect(props.onEditar).toHaveBeenLastCalledWith(
      21,
      expect.objectContaining({
        marcoId: "3",
        observacao: "Texto corrigido",
        numeroDocumento: "0000123",
        dataValidade: "2027-12-31",
      }),
    );
  });

  it("Cancelar descarta a correção do evento sem enviar nada", async () => {
    // Arrange
    const props = criarProps();
    props.eventos = [criarEventoTeste({ marco_id: 3 })];
    render(<MonitoramentoInternoEventos {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    // Act
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    // Assert
    expect(
      screen.queryByRole("button", { name: "Salvar correção" }),
    ).not.toBeInTheDocument();
    expect(props.onEditar).not.toHaveBeenCalled();
  });

  it("exclusão mantém erro seguro, permite cancelar e encaminha ID/motivo no sucesso", async () => {
    // Arrange
    const props = criarProps();
    props.onExcluir.mockRejectedValueOnce(
      new ApiError(
        "detalhe técnico privado",
        409,
        "O registro foi alterado. Atualize a tela.",
      ),
    );
    render(<MonitoramentoInternoEventos {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Excluir" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(props.onExcluir).not.toHaveBeenCalled();
    // Act / Assert
    await userEvent.click(screen.getByRole("button", { name: "Excluir" }));
    await userEvent.type(
      screen.getByPlaceholderText(/Explique por que/),
      "  Duplicidade  ",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar exclusão" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "O registro foi alterado. Atualize a tela.",
    );
    expect(
      screen.queryByText("detalhe técnico privado"),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar exclusão" }),
    );
    expect(props.onExcluir).toHaveBeenLastCalledWith(21, "Duplicidade", false);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Confirmar exclusão" }),
      ).not.toBeInTheDocument(),
    );
  });
  it.each(["editar", "excluir"])(
    "revogar permissão retira o formulário aberto para %s",
    async (modo) => {
      // Arrange
      const props = criarProps();
      const { rerender } = render(<MonitoramentoInternoEventos {...props} />);
      await userEvent.click(
        screen.getByRole("button", {
          name: modo === "editar" ? "Editar" : "Excluir",
        }),
      );
      // Act
      rerender(<MonitoramentoInternoEventos {...props} podeEditar={false} />);
      // Assert
      expect(
        screen.queryByRole("button", { name: "Salvar correção" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Confirmar exclusão" }),
      ).not.toBeInTheDocument();
      expect(props.onEditar).not.toHaveBeenCalled();
      expect(props.onExcluir).not.toHaveBeenCalled();
    },
  );
});
