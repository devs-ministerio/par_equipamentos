import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  criarInstrumentoTeste,
  criarEventoTeste,
  limparMonitoramentoHttp,
} from "@/test-fixtures/monitoramento-hooks";
import { prepararOrquestracao } from "@/test-fixtures/monitoramento-orquestracao";
import { MonitoramentoInterno } from "./monitoramento-interno";

afterEach(() => {
  cleanup();
  limparMonitoramentoHttp();
});

function montar(h = prepararOrquestracao()) {
  const tela = render(<MonitoramentoInterno numeroConvenio="QA001" />, {
    wrapper: h.wrapper,
  });
  return { ...h, tela };
}
async function editarCadastro() {
  const botao = await screen.findByRole("button", { name: "Editar cadastro" });
  await waitFor(() => expect(botao).toBeEnabled());
  fireEvent.click(botao);
  await waitFor(() =>
    expect(screen.getByLabelText("Técnico titular")).toBeEnabled(),
  );
}

describe("monitoramento interno com orquestração e filhos reais", () => {
  it("cabeçalho e cronograma reconhecem inauguração registrada após previsão com criação empatada", async () => {
    // Arrange
    const h = prepararOrquestracao();
    h.controle.timeline.eventos = [
      criarEventoTeste({
        id: 9,
        marco_id: 2,
        data_ocorrencia: null,
        data_prevista: "2030-01-01",
      }),
      criarEventoTeste({
        id: 10,
        marco_id: 2,
        data_ocorrencia: "2026-10-19",
        data_prevista: null,
      }),
    ];
    // Act
    montar(h);
    // Assert
    expect(await screen.findByText("Realizada")).toBeInTheDocument();
    const cronograma = screen
      .getByRole("heading", { name: "Cronograma físico" })
      .closest("section")!;
    expect(within(cronograma).getByText("19/10/2026")).toBeInTheDocument();
    expect(within(cronograma).queryByText(/2030/)).not.toBeInTheDocument();
  });

  it("cabeçalho e cronograma usam licença vigente, não o ID textual maior", async () => {
    // Arrange
    const h = prepararOrquestracao();
    h.controle.timeline.eventos = [
      criarEventoTeste({
        id: 9,
        marco_id: 3,
        numero_documento: "ANTIGO",
        data_validade: "2026-10-01",
        status_regulatorio: "Pendente",
      }),
      criarEventoTeste({
        id: 10,
        marco_id: 3,
        numero_documento: "ATUAL",
        data_validade: "2026-12-01",
        status_regulatorio: "Deferido",
      }),
    ];
    // Act
    montar(h);
    // Assert
    const rotulo = await screen.findByText("Licença CNEN");
    expect(
      within(rotulo.parentElement!).getByText("Deferido"),
    ).toBeInTheDocument();
    const regulatorio = screen
      .getByRole("heading", { name: "Regulatório (CNEN)" })
      .closest("section")!;
    expect(within(regulatorio).getByText(/ATUAL/)).toBeInTheDocument();
    expect(within(regulatorio).queryByText(/ANTIGO/)).not.toBeInTheDocument();
  });

  it.each(["ação", "evento"])(
    "edita %s e atualiza a coleção somente após resposta do servidor",
    async (tipo) => {
      // Arrange
      const h = prepararOrquestracao();
      h.controle.timeline.eventos = [
        criarEventoTeste({ marco_id: 1, observacao: "Evento original" }),
      ];
      montar(h);
      await screen.findByText("Cadastro interno");
      await waitFor(() => expect(h.client.isFetching()).toBe(0));
      let alvo: HTMLElement;
      if (tipo === "evento") {
        const resumo = screen.getByText(/Linha do tempo de eventos/, {
          selector: "summary",
        });
        fireEvent.click(resumo);
        alvo = resumo.closest("details")!;
      } else
        alvo = screen
          .getByRole("heading", { name: "Ações de monitoramento" })
          .closest("section")!;
      // Act
      fireEvent.click(within(alvo).getByRole("button", { name: "Editar" }));
      const campo =
        tipo === "ação"
          ? within(alvo).getByDisplayValue("Conferir documento sintético")
          : within(alvo).getByLabelText("Observação");
      fireEvent.change(campo, { target: { value: "Registro revisado" } });
      fireEvent.click(
        within(alvo).getByRole("button", { name: "Salvar correção" }),
      );
      // Assert
      expect(await screen.findByText("Registro revisado")).toBeInTheDocument();
      const pedido = h.fetch.mock.calls.find(
        ([input, init]) =>
          String(input).includes(
            tipo === "ação" ? "/acoes/11" : "/eventos/21",
          ) && init?.method === "PATCH",
      );
      expect(JSON.parse(String(pedido?.[1]?.body))).toMatchObject(
        tipo === "ação"
          ? {
              descricao: "Registro revisado",
              data_prevista: null,
              responsavel: null,
            }
          : {
              observacao: "Registro revisado",
              data_ocorrencia: "2026-10-19",
              data_prevista: null,
            },
      );
    },
  );

  it.each(["ação", "evento"])(
    "exclui %s enviando motivo e recarrega a coleção",
    async (tipo) => {
      // Arrange
      const h = prepararOrquestracao();
      h.controle.timeline.eventos = [
        criarEventoTeste({ marco_id: 1, observacao: "Evento original" }),
      ];
      montar(h);
      await screen.findByText("Cadastro interno");
      await waitFor(() => expect(h.client.isFetching()).toBe(0));
      let alvo: HTMLElement;
      if (tipo === "evento") {
        const resumo = screen.getByText(/Linha do tempo de eventos/, {
          selector: "summary",
        });
        fireEvent.click(resumo);
        alvo = resumo.closest("details")!;
      } else
        alvo = screen
          .getByRole("heading", { name: "Ações de monitoramento" })
          .closest("section")!;
      // Act
      fireEvent.click(within(alvo).getByRole("button", { name: "Excluir" }));
      fireEvent.change(within(alvo).getByLabelText("Motivo da exclusão"), {
        target: { value: "  Duplicidade sintética  " },
      });
      fireEvent.click(
        within(alvo).getByRole("button", { name: "Confirmar exclusão" }),
      );
      // Assert
      await waitFor(() =>
        expect(
          screen.queryByText(
            tipo === "ação"
              ? "Conferir documento sintético"
              : "Evento original",
          ),
        ).not.toBeInTheDocument(),
      );
      const pedido = h.fetch.mock.calls.find(
        ([, init]) => init?.method === "DELETE",
      );
      expect(JSON.parse(String(pedido?.[1]?.body))).toEqual({
        motivo: "Duplicidade sintética",
      });
    },
  );

  it("registra evento pelo transporte real e atualiza fase/timeline após confirmação", async () => {
    // Arrange
    const h = montar();
    const abrir = await screen.findByRole("button", {
      name: "+ Lançar evento",
    });
    await waitFor(() => expect(abrir).toBeEnabled());
    fireEvent.click(abrir);
    fireEvent.change(screen.getByLabelText("Marco"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("Data de ocorrência"), {
      target: { value: "2026-10-20" },
    });
    // Act
    fireEvent.click(screen.getByRole("button", { name: "Registrar evento" }));
    // Assert
    expect(await screen.findByText("Contratado — 50%")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Registrar evento" }),
    ).not.toBeInTheDocument();
    const pedido = h.fetch.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith("/eventos") && init?.method === "POST",
    );
    expect(JSON.parse(String(pedido?.[1]?.body))).toMatchObject({
      marco_id: 1,
      data_ocorrencia: "2026-10-20",
      data_prevista: null,
      confirmar_inauguracao: false,
    });
  });

  it("revalida a sessão em 403 e recolhe a edição após perder permissão", async () => {
    // Arrange
    const h = montar();
    await editarCadastro();
    h.controle.escritaStatus = 403;
    h.controle.usuario.role = "leitor";
    // Act
    fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
    // Assert
    await screen.findByText("Não foi possível carregar os dados");
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Salvar cadastro" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Editar cadastro" }),
    ).toBeDisabled();
    expect(
      h.fetch.mock.calls.filter(([input]) =>
        String(input).endsWith("/auth/me"),
      ),
    ).toHaveLength(2);
  });

  it("aguarda consultas essenciais e filtra ações pelo instrumento", async () => {
    // Arrange / Act
    montar();
    expect(
      screen.getByRole("status", { name: "Carregando" }),
    ).toBeInTheDocument();
    // Assert
    expect(
      await screen.findByText("Conferir documento sintético"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Ação de outro instrumento"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Cadastro interno")).toBeInTheDocument();
  });

  it("trata 404 como instrumento fora do escopo, não indisponibilidade", async () => {
    // Arrange
    const h = prepararOrquestracao();
    h.controle.timelineStatus = 404;
    // Act
    montar(h);
    // Assert
    expect(
      await screen.findByText(/Ainda não monitorado internamente/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Tentar novamente" }),
    ).not.toBeInTheDocument();
  });

  it.each(["timelineStatus", "marcosStatus", "acoesStatus"] as const)(
    "recupera falha de %s com retry das consultas essenciais",
    async (campo) => {
      // Arrange
      const h = prepararOrquestracao();
      h.controle[campo] = 503;
      montar(h);
      expect(
        await screen.findByRole("button", { name: "Tentar novamente" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("diagnóstico reservado"),
      ).not.toBeInTheDocument();
      // Act
      h.controle[campo] = 200;
      fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
      // Assert
      expect(await screen.findByText("Cadastro interno")).toBeInTheDocument();
      expect(
        screen.getByText("Conferir documento sintético"),
      ).toBeInTheDocument();
    },
  );

  it("respeita a negativa de edição do próprio instrumento", async () => {
    // Arrange
    const h = prepararOrquestracao();
    h.controle.timeline.instrumento.pode_editar = false;
    // Act
    montar(h);
    // Assert
    expect(
      await screen.findByRole("button", { name: "Editar cadastro" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Concluir ação/ }),
    ).toBeDisabled();
  });

  it("não habilita leitor com permissão antiga ainda no cache do instrumento", async () => {
    // Arrange
    const h = prepararOrquestracao();
    h.controle.usuario.role = "leitor";
    // Act
    montar(h);
    // Assert
    await screen.findByText("Cadastro interno");
    await waitFor(() => expect(h.client.isFetching()).toBe(0));
    expect(
      screen.getByRole("button", { name: "Editar cadastro" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Concluir ação/ }),
    ).toBeDisabled();
  });

  it("salva cadastro pelo PATCH real, normaliza opcionais e recarrega a timeline", async () => {
    // Arrange
    const h = montar();
    await editarCadastro();
    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Responsável atualizado" },
    });
    // Act
    fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
    // Assert
    expect(
      (await screen.findAllByText("Responsável atualizado"))[0],
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Salvar cadastro" }),
    ).not.toBeInTheDocument();
    const pedido = h.fetch.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(JSON.parse(String(pedido?.[1]?.body))).toEqual({
      tecnico_titular_id: 1,
      tecnico_suplente_id: null,
      nivel_monitoramento: null,
      tipologia: null,
      modalidade_onco: null,
      responsavel_execucao_nome: "Responsável atualizado",
      responsavel_execucao_contato: null,
      cnes: null,
    });
    expect(pedido?.[1]?.headers).toEqual(
      expect.objectContaining({ "X-CSRF-Token": "csrf-sintetico" }),
    );
  });

  it("falha de cadastro mantém edição e não revalida sessão por erro 503", async () => {
    // Arrange
    const h = montar();
    await editarCadastro();
    const sessoes = () =>
      h.fetch.mock.calls.filter(([input]) => String(input).endsWith("/auth/me"))
        .length;
    const antes = sessoes();
    h.controle.escritaStatus = 503;
    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Edição preservada" },
    });
    // Act
    fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
    await screen.findByText("Não foi possível carregar os dados");
    await waitFor(() => expect(h.client.isFetching()).toBe(0));
    // Assert
    expect(screen.getByLabelText("Nome")).toHaveValue("Edição preservada");
    expect(sessoes()).toBe(antes);
    h.controle.escritaStatus = 200;
    fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
    expect(
      (await screen.findAllByText("Edição preservada"))[0],
    ).toBeInTheDocument();
  });

  it("cria ação com HTTP/CSRF, atualiza a lista e não inventa prazo", async () => {
    // Arrange
    const h = montar();
    await screen.findByText("Cadastro interno");
    fireEvent.change(screen.getByLabelText("Nova ação"), {
      target: { value: "Nova ação sintética" },
    });
    // Act
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "+ Adicionar" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "+ Adicionar" }));
    // Assert
    expect(await screen.findByText("Nova ação sintética")).toBeInTheDocument();
    const pedido = h.fetch.mock.calls.find(
      ([, init]) => init?.method === "POST",
    );
    expect(JSON.parse(String(pedido?.[1]?.body))).toEqual({
      descricao: "Nova ação sintética",
      data_prevista: null,
      responsavel: null,
    });
    expect(screen.getByLabelText("Nova ação")).toHaveValue("");
  });

  it("conclui ação e atualiza os indicadores sem nova ação automática", async () => {
    // Arrange
    const h = montar();
    const botao = await screen.findByRole("button", { name: /Concluir ação/ });
    // Act
    fireEvent.click(botao);
    // Assert
    expect(
      await screen.findByText("Concluída em 20/10/2026"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Concluir ação/ }),
    ).not.toBeInTheDocument();
    expect(
      h.fetch.mock.calls.filter(([, init]) => init?.method === "PATCH"),
    ).toHaveLength(1);
  });

  it("falha de conclusão mostra erro sem rejeição não tratada e permite retry", async () => {
    // Arrange
    const h = montar();
    h.controle.escritaStatus = 503;
    const botao = await screen.findByRole("button", { name: /Concluir ação/ });
    // Act
    fireEvent.click(botao);
    // Assert
    await screen.findByText("Não foi possível carregar os dados");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Concluir ação/ }),
      ).toBeEnabled(),
    );
    h.controle.escritaStatus = 200;
    fireEvent.click(screen.getByRole("button", { name: /Concluir ação/ }));
    expect(
      await screen.findByText("Concluída em 20/10/2026"),
    ).toBeInTheDocument();
  });

  it("não transporta edição aberta ou erro de escrita ao trocar de instrumento", async () => {
    // Arrange
    const h = montar();
    await editarCadastro();
    h.controle.escritaStatus = 503;
    fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
    await screen.findByText("Não foi possível carregar os dados");
    h.controle.timeline.instrumento = criarInstrumentoTeste({
      id: 2,
      nr_convenio: "QA002",
      responsavel_execucao_nome: "Responsável QA002",
    });
    // Act
    h.tela.rerender(<MonitoramentoInterno numeroConvenio="QA002" />);
    // Assert
    expect(
      (await screen.findAllByText("Responsável QA002"))[0],
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Salvar cadastro" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Não foi possível carregar os dados"),
    ).not.toBeInTheDocument();
  });
});
