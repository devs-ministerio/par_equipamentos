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
    onRegistrar: vi.fn().mockResolvedValue(undefined),
    onEditar: vi.fn().mockResolvedValue(undefined),
    onExcluir: vi.fn().mockResolvedValue(undefined),
  };
}

describe("interação da timeline de eventos", () => {
  it("vazio sem permissão mantém histórico legível e lançamento bloqueado", async () => {
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
      screen.getByRole("button", { name: "+ Lançar evento" }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByRole("button", { name: "+ Lançar evento" }),
    );
    expect(
      screen.queryByRole("button", { name: "Registrar evento" }),
    ).not.toBeInTheDocument();
    expect(props.onRegistrar).not.toHaveBeenCalled();
  });

  it("prioriza ocorrência, previsão e criação ao ordenar sem alterar a coleção recebida", () => {
    // Arrange
    const props = criarProps();
    props.eventos = [
      criarEventoTeste({
        id: 1,
        marco_id: 1,
        data_ocorrencia: "2026-01-01",
        observacao: "Ordem ocorrência",
      }),
      criarEventoTeste({
        id: 2,
        marco_id: 2,
        data_ocorrencia: null,
        data_prevista: "2026-02-01",
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

  it("pode cancelar lançamento e falha ao registrar preserva o conteúdo para tentar novamente", async () => {
    // Arrange
    const props = criarProps();
    props.onRegistrar.mockRejectedValueOnce(
      new ApiError("Fonte indisponível", 503),
    );
    render(<MonitoramentoInternoEventos {...props} />);
    await userEvent.click(
      screen.getByRole("button", { name: "+ Lançar evento" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(props.onRegistrar).not.toHaveBeenCalled();
    // Act / Assert
    await userEvent.click(
      screen.getByRole("button", { name: "+ Lançar evento" }),
    );
    await userEvent.selectOptions(screen.getByLabelText("Marco"), "1");
    await userEvent.type(
      screen.getByLabelText("Observação"),
      "Registro sintético",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Registrar evento" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Registrar evento" }),
      ).toBeEnabled(),
    );
    expect(screen.getByLabelText("Observação")).toHaveValue(
      "Registro sintético",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Registrar evento" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Registrar evento" }),
      ).not.toBeInTheDocument(),
    );
    expect(props.onRegistrar).toHaveBeenLastCalledWith(
      expect.objectContaining({
        marcoId: "1",
        observacao: "Registro sintético",
      }),
    );
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
    expect(
      within(form).getByLabelText("Fase geral correspondente"),
    ).toHaveValue("1");
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
      within(form).getByLabelText("Nº matrícula/licença/processo"),
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
        faseGeralId: "1",
        observacao: "Texto corrigido",
        numeroDocumento: "0000123",
        dataValidade: "2027-12-31",
      }),
    );
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
    expect(props.onExcluir).toHaveBeenLastCalledWith(21, "Duplicidade");
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Confirmar exclusão" }),
      ).not.toBeInTheDocument(),
    );
  });
  it.each(["lançar", "editar", "excluir"])(
    "revogar permissão retira o formulário aberto para %s",
    async (modo) => {
      // Arrange
      const props = criarProps();
      const { rerender } = render(<MonitoramentoInternoEventos {...props} />);
      await userEvent.click(
        screen.getByRole("button", {
          name:
            modo === "lançar"
              ? "+ Lançar evento"
              : modo === "editar"
                ? "Editar"
                : "Excluir",
        }),
      );
      // Act
      rerender(<MonitoramentoInternoEventos {...props} podeEditar={false} />);
      // Assert
      expect(
        screen.queryByRole("button", { name: "Registrar evento" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Salvar correção" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Confirmar exclusão" }),
      ).not.toBeInTheDocument();
      expect(props.onRegistrar).not.toHaveBeenCalled();
      expect(props.onEditar).not.toHaveBeenCalled();
      expect(props.onExcluir).not.toHaveBeenCalled();
    },
  );

  it("lançamento e correção simultâneos mantêm controles com rótulos próprios", async () => {
    // Arrange
    render(<MonitoramentoInternoEventos {...criarProps()} />);
    // Act
    await userEvent.click(
      screen.getByRole("button", { name: "+ Lançar evento" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    // Assert
    expect(screen.getAllByRole("textbox", { name: "Observação" })).toHaveLength(
      2,
    );
    expect(screen.getAllByLabelText("Data de ocorrência")).toHaveLength(2);
  });

  it("desempata a previsão mais recente por ID numérico, não por ordem textual", async () => {
    // Arrange
    const props = criarProps();
    props.eventos = [
      criarEventoTeste({
        id: 9,
        marco_id: 2,
        data_ocorrencia: null,
        data_prevista: "2026-11-01",
      }),
      criarEventoTeste({
        id: 10,
        marco_id: 2,
        data_ocorrencia: null,
        data_prevista: "2026-12-01",
      }),
    ];
    render(<MonitoramentoInternoEventos {...props} />);
    // Act
    await userEvent.click(
      screen.getByRole("button", { name: "+ Lançar evento" }),
    );
    await userEvent.selectOptions(screen.getByLabelText("Marco"), "4");
    await userEvent.type(
      screen.getByLabelText("Data de ocorrência"),
      "2026-12-01",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Registrar evento" }),
    );
    // Assert
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "A previsão registrada (2026-12-01) é igual à data de conclusão.",
    );
    expect(props.onRegistrar).not.toHaveBeenCalled();
  });
});
