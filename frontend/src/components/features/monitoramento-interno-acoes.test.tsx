import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-error";
import { criarAcaoTeste } from "@/test-fixtures/monitoramento-hooks";
import { MonitoramentoInternoAcoes } from "./monitoramento-interno-acoes";

function criarProps() {
  return {
    acoes: [
      criarAcaoTeste({
        responsavel: "Convenente",
        data_prevista: "2099-11-01",
      }),
    ],
    podeEditar: true,
    concluindoAcaoId: null as number | null,
    onCriar: vi.fn().mockResolvedValue(undefined),
    onConcluir: vi.fn(),
    onEditar: vi.fn().mockResolvedValue(undefined),
    onExcluir: vi.fn().mockResolvedValue(undefined),
  };
}

describe("interação das ações de monitoramento", () => {
  it.each([undefined, []])(
    "lista %s mostra vazio e permite preparar nova ação",
    (acoes) => {
      // Arrange / Act
      const props = criarProps();
      render(<MonitoramentoInternoAcoes {...props} acoes={acoes} />);
      // Assert
      expect(
        screen.getByText("Nenhuma ação registrada ainda."),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "+ Adicionar" })).toBeEnabled();
    },
  );

  it("leitura sem permissão não oferece edição/exclusão e bloqueia conclusão/criação", async () => {
    // Arrange
    const props = criarProps();
    render(<MonitoramentoInternoAcoes {...props} podeEditar={false} />);
    // Act / Assert
    expect(
      screen.queryByRole("button", { name: "Editar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Excluir" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Adicionar" })).toBeDisabled();
    const concluir = screen.getByRole("button", { name: /Concluir ação:/ });
    expect(concluir).toBeDisabled();
    await userEvent.click(concluir);
    expect(props.onConcluir).not.toHaveBeenCalled();
  });

  it("ordena pendentes por prazo antes das concluídas sem alterar a lista recebida", () => {
    // Arrange
    const props = criarProps();
    props.acoes = [
      criarAcaoTeste({
        id: 1,
        descricao: "Concluída",
        data_conclusao: "2026-01-01",
        criado_por_nome: "Pessoa criadora",
      }),
      criarAcaoTeste({ id: 2, descricao: "Sem prazo" }),
      criarAcaoTeste({
        id: 3,
        descricao: "Prazo antigo",
        data_prevista: "2000-01-01",
        responsavel_nome: "Pessoa designada",
      }),
      criarAcaoTeste({
        id: 4,
        descricao: "Prazo futuro",
        data_prevista: "2099-01-01",
      }),
    ];
    const { container } = render(<MonitoramentoInternoAcoes {...props} />);
    // Act / Assert
    const ordem = [...container.querySelectorAll("button[aria-label]")].map(
      (b) => b.getAttribute("aria-label"),
    );
    expect(ordem).toEqual([
      "Concluir ação: Prazo antigo",
      "Concluir ação: Prazo futuro",
      "Concluir ação: Sem prazo",
    ]);
    expect(props.acoes.map((a) => a.id)).toEqual([1, 2, 3, 4]);
    expect(screen.getByText(/atrasada há/)).toBeInTheDocument();
    expect(screen.getByText("Sem prazo definido")).toBeInTheDocument();
    expect(screen.getByText(/Concluída em 01\/01\/2026/)).toBeInTheDocument();
    expect(screen.getByText("Criada por Pessoa criadora")).toBeInTheDocument();
    expect(
      screen.getByText(/Responsável: Pessoa designada/),
    ).toBeInTheDocument();
  });

  it("concluir encaminha o ID e bloqueia repetição enquanto está pendente", async () => {
    // Arrange
    const props = criarProps();
    const { rerender } = render(<MonitoramentoInternoAcoes {...props} />);
    // Act
    await userEvent.click(
      screen.getByRole("button", { name: /Concluir ação:/ }),
    );
    rerender(<MonitoramentoInternoAcoes {...props} concluindoAcaoId={11} />);
    await userEvent.click(
      screen.getByRole("button", { name: /Concluir ação:/ }),
    );
    // Assert
    expect(props.onConcluir).toHaveBeenCalledExactlyOnceWith(11);
    expect(
      screen.getByRole("button", { name: /Concluir ação:/ }),
    ).toBeDisabled();
  });

  it("valida descrição e bloqueia reenvio enquanto cria; limpa no sucesso", async () => {
    // Arrange
    const props = criarProps();
    let terminar!: () => void;
    props.onCriar.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          terminar = resolve;
        }),
    );
    render(<MonitoramentoInternoAcoes {...props} acoes={[]} />);
    // Act / Assert
    await userEvent.click(screen.getByRole("button", { name: "+ Adicionar" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Descreva o que precisa ser feito.",
    );
    expect(props.onCriar).not.toHaveBeenCalled();
    await userEvent.type(
      screen.getByLabelText("Nova ação"),
      "  Conferir entrega  ",
    );
    await userEvent.type(screen.getByLabelText("Prazo"), "2026-11-01");
    await userEvent.selectOptions(
      screen.getByLabelText("Responsável"),
      "Convenente",
    );
    await userEvent.click(screen.getByRole("button", { name: "+ Adicionar" }));
    expect(
      screen.getByRole("button", { name: "Adicionando..." }),
    ).toBeDisabled();
    expect(props.onCriar).toHaveBeenCalledExactlyOnceWith({
      descricao: "Conferir entrega",
      dataPrevista: "2026-11-01",
      responsavel: "Convenente",
    });
    terminar();
    await waitFor(() =>
      expect(screen.getByLabelText("Nova ação")).toHaveValue(""),
    );
  });

  it("falha ao criar mantém os campos para tentar novamente", async () => {
    // Arrange
    const props = criarProps();
    props.onCriar.mockRejectedValueOnce(new ApiError("Sem conexão", 503));
    render(<MonitoramentoInternoAcoes {...props} acoes={[]} />);
    // Act
    await userEvent.type(
      screen.getByLabelText("Nova ação"),
      "Conferir entrega",
    );
    await userEvent.click(screen.getByRole("button", { name: "+ Adicionar" }));
    // Assert
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "+ Adicionar" })).toBeEnabled(),
    );
    expect(screen.getByLabelText("Nova ação")).toHaveValue("Conferir entrega");
  });
  it("edição preserva responsável histórico fora das opções atuais", async () => {
    // Arrange
    const props = criarProps();
    props.acoes = [criarAcaoTeste({ responsavel: "Equipe histórica externa" })];
    render(<MonitoramentoInternoAcoes {...props} />);
    // Act
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    // Assert
    const form = screen
      .getByRole("button", { name: "Salvar correção" })
      .closest("form")!;
    expect(
      within(form).getByRole("combobox", { name: "Responsável" }),
    ).toHaveValue("Equipe histórica externa");
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar correção" }),
    );
    expect(props.onEditar).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ responsavel: "Equipe histórica externa" }),
    );
  });

  it("criação e edição têm labels ligados aos seus próprios controles", async () => {
    // Arrange
    const props = criarProps();
    render(<MonitoramentoInternoAcoes {...props} />);
    // Act
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    // Assert
    expect(screen.getAllByRole("textbox", { name: "Nova ação" })).toHaveLength(
      2,
    );
    expect(
      screen.getAllByRole("combobox", { name: "Responsável" }),
    ).toHaveLength(2);
  });

  it("retirar permissão fecha a confirmação de exclusão aberta", async () => {
    // Arrange
    const props = criarProps();
    const { rerender } = render(<MonitoramentoInternoAcoes {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Excluir" }));
    // Act
    rerender(<MonitoramentoInternoAcoes {...props} podeEditar={false} />);
    // Assert
    expect(
      screen.queryByRole("button", { name: "Confirmar exclusão" }),
    ).not.toBeInTheDocument();
    expect(props.onExcluir).not.toHaveBeenCalled();
  });

  it("falha ao editar mantém a correção e sucesso fecha apenas a edição", async () => {
    // Arrange
    const props = criarProps();
    props.onEditar.mockRejectedValueOnce(new ApiError("Conflito", 409));
    render(<MonitoramentoInternoAcoes {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    const form = screen
      .getByRole("button", { name: "Salvar correção" })
      .closest("form")!;
    // Act / Assert
    await userEvent.clear(within(form).getByLabelText("Nova ação"));
    await userEvent.type(
      within(form).getByLabelText("Nova ação"),
      "Descrição corrigida",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar correção" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Salvar correção" }),
      ).toBeEnabled(),
    );
    expect(within(form).getByLabelText("Nova ação")).toHaveValue(
      "Descrição corrigida",
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
      11,
      expect.objectContaining({
        descricao: "Descrição corrigida",
        dataPrevista: "2099-11-01",
      }),
    );
    expect(
      screen.getByRole("button", { name: "+ Adicionar" }),
    ).toBeInTheDocument();
  });

  it("exclusão exige motivo, pode ser cancelada e só fecha após sucesso", async () => {
    // Arrange
    const props = criarProps();
    render(<MonitoramentoInternoAcoes {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Excluir" }));
    // Act / Assert
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(props.onExcluir).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Excluir" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar exclusão" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("mínimo 3 caracteres");
    await userEvent.type(
      screen.getByPlaceholderText(/Explique por que/),
      "  Lançamento duplicado  ",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar exclusão" }),
    );
    expect(props.onExcluir).toHaveBeenCalledExactlyOnceWith(
      11,
      "Lançamento duplicado",
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Confirmar exclusão" }),
      ).not.toBeInTheDocument(),
    );
  });
});
