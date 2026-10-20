import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import {
  criarInstrumentoTeste,
  limparMonitoramentoHttp,
  prepararMonitoramentoHttp,
} from "@/test-fixtures/monitoramento-hooks";
import { MonitoramentoInternoCadastro } from "./monitoramento-interno-cadastro";

afterEach(() => {
  cleanup();
  limparMonitoramentoHttp();
});
type Props = ComponentProps<typeof MonitoramentoInternoCadastro>;

function montar(extra: Partial<Props> = {}) {
  const h = prepararMonitoramentoHttp();
  h.fetch.mockImplementation(async () =>
    h.json([
      { id: 1, name: "Titular sintético" },
      { id: 2, name: "Suplente sintético" },
    ]),
  );
  const props: Props = {
    instrumento: criarInstrumentoTeste({
      tecnico_titular_id: 1,
      tecnico_titular: "Titular sintético",
      tecnico_suplente_id: 2,
      tecnico_suplente: "Suplente sintético",
      responsavel_execucao_nome: "Responsável da instituição",
      responsavel_execucao_contato: "contato sintético",
    }),
    podeEditar: true,
    aberto: true,
    onAbrir: vi.fn(),
    onFechar: vi.fn(),
    onSalvar: vi.fn(async () => {}),
    ...extra,
  };
  const tela = render(<MonitoramentoInternoCadastro {...props} />, {
    wrapper: h.wrapper,
  });
  return { ...h, props, tela };
}

async function pronto() {
  await waitFor(() =>
    expect(screen.getByLabelText("Técnico titular")).toBeEnabled(),
  );
}

describe("cadastro interno com form, Query e consultas reais", () => {
  it.each(["escolher", "limpar"])(
    "integra %s CNES ao envio do cadastro sem aceitar texto livre",
    async (acao) => {
      // Arrange
      const h = montar({
        instrumento: criarInstrumentoTeste({
          tecnico_titular_id: 1,
          cnes: acao === "limpar" ? "0000001" : null,
        }),
      });
      await pronto();
      h.fetch.mockImplementation(async () =>
        h.json([
          {
            cnes: "0000001",
            nome_estabelecimento: "Unidade CNES sintética",
            municipio: "Cidade sintética",
            uf: "BA",
          },
        ]),
      );
      // Act
      if (acao === "limpar")
        fireEvent.click(
          screen.getByRole("button", { name: "Limpar CNES atual (0000001)" }),
        );
      else {
        fireEvent.change(screen.getByLabelText("CNES"), {
          target: { value: "Unidade" },
        });
        fireEvent.click(
          await screen.findByRole("button", { name: /Unidade CNES sintética/ }),
        );
      }
      fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
      // Assert
      await waitFor(() =>
        expect(h.props.onSalvar).toHaveBeenCalledWith(
          expect.objectContaining({ cnes: acao === "limpar" ? "" : "0000001" }),
        ),
      );
    },
  );

  it("apresenta técnicos da equipe separados do responsável institucional sem consultar opções", () => {
    // Arrange / Act
    const h = montar({ aberto: false });
    // Assert
    expect(screen.getByText("Titular sintético")).toBeInTheDocument();
    expect(screen.getByText("Suplente sintético")).toBeInTheDocument();
    expect(screen.getByText("Responsável da instituição")).toBeInTheDocument();
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("desabilita edição na leitura sem permissão", () => {
    // Arrange / Act
    montar({ aberto: false, podeEditar: false });
    // Assert
    expect(
      screen.getByRole("button", { name: "Editar cadastro" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Salvar cadastro" }),
    ).not.toBeInTheDocument();
  });

  it("não monta form se a permissão foi revogada com edição aberta", async () => {
    // Arrange
    const h = montar();
    await pronto();
    // Act
    h.tela.rerender(
      <MonitoramentoInternoCadastro {...h.props} podeEditar={false} />,
    );
    // Assert
    expect(
      screen.queryByRole("button", { name: "Salvar cadastro" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Responsável da instituição")).toBeInTheDocument();
  });

  it("abre e cancela pelo controle do pai", async () => {
    // Arrange
    const h = montar({ aberto: false });
    // Act / Assert
    fireEvent.click(screen.getByRole("button", { name: "Editar cadastro" }));
    expect(h.props.onAbrir).toHaveBeenCalledOnce();
    h.tela.rerender(<MonitoramentoInternoCadastro {...h.props} aberto />);
    await pronto();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(h.props.onFechar).toHaveBeenCalledOnce();
    expect(h.props.onSalvar).not.toHaveBeenCalled();
  });

  it("mostra erro associado ao titular obrigatório sem enviar", async () => {
    // Arrange
    const h = montar({ instrumento: criarInstrumentoTeste() });
    await pronto();
    // Act
    fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Selecione o técnico titular responsável.",
    );
    expect(screen.getByLabelText("Técnico titular")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      screen.getByLabelText("Técnico titular"),
    ).toHaveAccessibleDescription("Selecione o técnico titular responsável.");
    expect(h.props.onSalvar).not.toHaveBeenCalled();
  });

  it("não permite salvar enquanto os colaboradores estão carregando", async () => {
    // Arrange
    const h = prepararMonitoramentoHttp();
    let responder!: (r: Response) => void;
    h.fetch.mockReturnValueOnce(
      new Promise((resolve) => {
        responder = resolve;
      }),
    );
    // Act
    render(
      <MonitoramentoInternoCadastro
        instrumento={criarInstrumentoTeste()}
        aberto
        podeEditar
        onSalvar={vi.fn()}
        onAbrir={vi.fn()}
        onFechar={vi.fn()}
      />,
      { wrapper: h.wrapper },
    );
    // Assert
    expect(screen.getByLabelText("Técnico titular")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Salvar cadastro" }),
    ).toBeDisabled();
    responder(h.json([{ id: 1, name: "Titular sintético" }]));
    await pronto();
  });

  it("expõe falha da consulta de técnicos e permite nova tentativa sem perder edição", async () => {
    // Arrange
    const h = prepararMonitoramentoHttp();
    h.fetch
      .mockResolvedValueOnce(h.json({ detail: "diagnóstico reservado" }, 503))
      .mockImplementation(async () =>
        h.json([{ id: 1, name: "Titular sintético" }]),
      );
    render(
      <MonitoramentoInternoCadastro
        instrumento={criarInstrumentoTeste()}
        aberto
        podeEditar
        onSalvar={vi.fn()}
        onAbrir={vi.fn()}
        onFechar={vi.fn()}
      />,
      { wrapper: h.wrapper },
    );
    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Edição preservada" },
    });
    // Act / Assert
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar os colaboradores.",
    );
    expect(
      screen.getByRole("button", { name: "Salvar cadastro" }),
    ).toBeDisabled();
    expect(screen.queryByText(/diagnóstico reservado/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await pronto();
    expect(screen.getByLabelText("Nome")).toHaveValue("Edição preservada");
  });

  it("preserva técnicos atuais ausentes do catálogo retornado e valores históricos", async () => {
    // Arrange
    const h = montar({
      instrumento: criarInstrumentoTeste({
        tecnico_titular_id: 91,
        tecnico_titular: "Titular histórico",
        tecnico_suplente_id: 92,
        tecnico_suplente: "Suplente histórico",
        nivel_monitoramento: "Nível histórico",
        modalidade_onco: "Modalidade histórica",
        tipologia: "NA",
      }),
    });
    await pronto();
    // Act
    fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
    // Assert
    expect(screen.getByLabelText("Técnico titular")).toHaveValue("91");
    expect(screen.getByLabelText("Técnico suplente")).toHaveValue("92");
    await waitFor(() =>
      expect(h.props.onSalvar).toHaveBeenCalledWith(
        expect.objectContaining({
          tecnicoTitular: "91",
          tecnicoSuplente: "92",
          nivelMonitoramento: "Nível histórico",
          modalidadeOnco: "Modalidade histórica",
          tipologia: "NA",
        }),
      ),
    );
  });

  it("associa labels a controles distintos em dois cadastros simultâneos", async () => {
    // Arrange
    const h = prepararMonitoramentoHttp();
    h.fetch.mockImplementation(async () =>
      h.json([{ id: 1, name: "Titular sintético" }]),
    );
    const props = {
      aberto: true,
      podeEditar: true,
      onSalvar: vi.fn(async () => {}),
      onAbrir: vi.fn(),
      onFechar: vi.fn(),
    };
    // Act
    render(
      <>
        <MonitoramentoInternoCadastro
          {...props}
          instrumento={criarInstrumentoTeste()}
        />
        <MonitoramentoInternoCadastro
          {...props}
          instrumento={criarInstrumentoTeste({ id: 2, nr_convenio: "QA002" })}
        />
      </>,
      { wrapper: h.wrapper },
    );
    await waitFor(() =>
      expect(screen.getAllByLabelText("Técnico titular")[0]).toBeEnabled(),
    );
    // Assert
    const ids = [...document.querySelectorAll("input[id],select[id]")].map(
      (e) => e.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(screen.getAllByLabelText("CNES")).toHaveLength(2);
    expect(screen.getAllByLabelText("Nome")).toHaveLength(2);
  });

  it("envia somente os campos do cadastro e fecha após sucesso", async () => {
    // Arrange
    const h = montar();
    await pronto();
    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Outro responsável da instituição" },
    });
    // Act
    fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
    // Assert
    await waitFor(() => expect(h.props.onFechar).toHaveBeenCalledOnce());
    const valores = vi.mocked(h.props.onSalvar).mock.calls[0][0];
    expect(valores).toMatchObject({
      tecnicoTitular: "1",
      tecnicoSuplente: "2",
      responsavelExecucaoNome: "Outro responsável da instituição",
      responsavelExecucaoContato: "contato sintético",
    });
    expect(valores).not.toHaveProperty("equipamento_descricao");
    expect(valores).not.toHaveProperty("nr_convenio");
  });

  it("mantém formulário e valores após falha de escrita para retry explícito", async () => {
    // Arrange
    const salvar = vi
      .fn()
      .mockRejectedValueOnce(new Error("Falha sintética"))
      .mockResolvedValueOnce(undefined);
    const h = montar({ onSalvar: salvar });
    await pronto();
    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Não perder edição" },
    });
    // Act
    fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
    await waitFor(() => expect(salvar).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Salvar cadastro" }),
      ).toBeEnabled(),
    );
    // Assert
    expect(h.props.onFechar).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Nome")).toHaveValue("Não perder edição");
    fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
    await waitFor(() => expect(h.props.onFechar).toHaveBeenCalledOnce());
  });

  it("bloqueia duplo envio enquanto salva", async () => {
    // Arrange
    let concluir!: () => void;
    const salvar = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          concluir = resolve;
        }),
    );
    const h = montar({ onSalvar: salvar });
    await pronto();
    // Act
    fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
    await screen.findByRole("button", { name: "Salvando..." });
    fireEvent.click(screen.getByRole("button", { name: "Salvando..." }));
    // Assert
    expect(salvar).toHaveBeenCalledOnce();
    concluir();
    await waitFor(() => expect(h.props.onFechar).toHaveBeenCalledOnce());
  });

  it("não transporta valores de um instrumento para outro", async () => {
    // Arrange
    const h = montar();
    await pronto();
    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Edição do primeiro" },
    });
    // Act
    h.tela.rerender(
      <MonitoramentoInternoCadastro
        {...h.props}
        instrumento={criarInstrumentoTeste({
          id: 2,
          nr_convenio: "QA002",
          responsavel_execucao_nome: "Responsável do segundo",
        })}
      />,
    );
    // Assert
    expect(screen.getByLabelText("Nome")).toHaveValue("Responsável do segundo");
  });

  it("não apaga edição local ao atualizar o mesmo instrumento", async () => {
    // Arrange
    const h = montar();
    await pronto();
    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Edição local" },
    });
    // Act
    h.tela.rerender(
      <MonitoramentoInternoCadastro
        {...h.props}
        instrumento={{
          ...h.props.instrumento,
          responsavel_execucao_nome: "Refresh remoto",
        }}
      />,
    );
    // Assert
    expect(screen.getByLabelText("Nome")).toHaveValue("Edição local");
  });
});
