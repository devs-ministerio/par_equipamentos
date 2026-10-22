import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  limparConsultasCobertura,
  prepararConsultasCobertura,
} from "@/test-fixtures/consultas-cobertura";
import {
  criarDetalheConvenioResposta,
  criarResumoConvenio,
} from "@/test-fixtures/convenios-detalhe";
import { ConvenioCard } from "./convenio-card";

afterEach(() => {
  cleanup();
  limparConsultasCobertura();
});

function montar(c = criarResumoConvenio()) {
  const h = prepararConsultasCobertura();
  h.fetch.mockImplementation(async () =>
    h.json(criarDetalheConvenioResposta()),
  );
  const wrapper = ({ children }: PropsWithChildren) => (
    <h.wrapper>
      <MemoryRouter>{children}</MemoryRouter>
    </h.wrapper>
  );
  const tela = render(<ConvenioCard c={c} monitorado />, { wrapper });
  return { ...h, tela, user: userEvent.setup() };
}

describe("card de instrumento integrado ao detalhe oficial", () => {
  it("não reutiliza detalhe antigo quando o resumo do mesmo instrumento muda", async () => {
    // Arrange
    const h = montar();
    await h.user.click(screen.getByText("Mais detalhes"));
    await screen.findByText("Dados aninhados (SICONV)");
    h.fetch.mockResolvedValueOnce(
      h.json(
        criarDetalheConvenioResposta({
          programa: "Programa revisão atual",
          numero_processo: "PROCESSO-ATUALIZADO",
        }),
      ),
    );
    // Act
    h.tela.rerender(
      <ConvenioCard
        c={criarResumoConvenio({ programa: "Programa revisão atual" })}
        monitorado
      />,
    );
    // Assert
    expect(await screen.findByText("PROCESSO-ATUALIZADO")).toBeVisible();
    expect(screen.getByText("Programa revisão atual")).toBeInTheDocument();
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it("não aplica cache oficial a uma carga manual do mesmo identificador", async () => {
    // Arrange
    const h = montar();
    await h.user.click(screen.getByText("Mais detalhes"));
    await screen.findByText("Dados aninhados (SICONV)");
    // Act
    h.tela.rerender(
      <ConvenioCard
        c={criarResumoConvenio({
          tipoContratacao: "TED",
          programa: "Carga manual sintética",
          dadosOficiaisDisponiveis: false,
        })}
        monitorado
      />,
    );
    // Assert
    expect(screen.getByText("Carga manual sintética")).toBeInTheDocument();
    expect(
      screen.queryByText("Dados aninhados (SICONV)"),
    ).not.toBeInTheDocument();
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it("mostra resumo sem carregar nem montar detalhe antes de abrir", () => {
    // Arrange / Act
    const h = montar();
    // Assert
    expect(screen.getByText("QA001")).toBeInTheDocument();
    expect(screen.getByText("Unidade sintética")).toBeInTheDocument();
    expect(h.fetch).not.toHaveBeenCalled();
    expect(
      screen.queryByText("Não encontrado no dump SICONV."),
    ).not.toBeInTheDocument();
  });

  it.each(["FAF", "TED", "PERSUS I", "PERSUS II"])(
    "não consulta fonte oficial para carga manual %s",
    async (tipoContratacao) => {
      // Arrange
      const h = montar(
        criarResumoConvenio({
          tipoContratacao,
          dadosOficiaisDisponiveis: false,
          desembolsoIntegralDaCarga: true,
        }),
      );
      // Act
      await h.user.click(screen.getByText("Mais detalhes"));
      await screen.findByText("Menos detalhes");
      // Assert
      expect(screen.getByText("Monitoramento interno")).toBeVisible();
      expect(h.fetch).not.toHaveBeenCalled();
      expect(
        screen.queryByText("Carregando detalhes..."),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("Dados aninhados (SICONV)"),
      ).not.toBeInTheDocument();
    },
  );

  it("mostra loading sem declarar ausência no dump antes da resposta", async () => {
    // Arrange
    const h = montar();
    let responder!: (response: Response) => void;
    h.fetch.mockReturnValueOnce(
      new Promise((resolve) => {
        responder = resolve;
      }),
    );
    // Act
    await h.user.click(screen.getByText("Mais detalhes"));
    expect(await screen.findByText("Carregando detalhes...")).toBeVisible();
    expect(
      screen.queryByText("Não encontrado no dump SICONV."),
    ).not.toBeInTheDocument();
    responder(h.json(criarDetalheConvenioResposta()));
    // Assert
    expect(await screen.findByText("Dados aninhados (SICONV)")).toBeVisible();
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["http", "schema", "rede", "identidade"])(
    "trata falha %s com aviso e retry sem fingir ausência na fonte",
    async (falha) => {
      // Arrange
      const h = montar();
      if (falha === "rede")
        h.fetch.mockRejectedValueOnce(new Error("diagnóstico reservado"));
      else
        h.fetch.mockResolvedValueOnce(
          falha === "http"
            ? h.json({ detail: "diagnóstico reservado" }, 503)
            : falha === "schema"
              ? h.json({ segredo: "diagnóstico reservado" })
              : h.json(
                  criarDetalheConvenioResposta({
                    numero: "OUTRO",
                    numero_processo: "PROCESSO-DE-OUTRO",
                  }),
                ),
        );
      // Act
      await h.user.click(screen.getByText("Mais detalhes"));
      // Assert
      const erro = await screen.findByRole("alert");
      expect(erro).toHaveTextContent("Não foi possível carregar os detalhes");
      expect(
        screen.queryByText("Não encontrado no dump SICONV."),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("PROCESSO-DE-OUTRO")).not.toBeInTheDocument();
      expect(
        screen.queryByText(/diagnóstico reservado/),
      ).not.toBeInTheDocument();
      // Act / Assert: retry é decisão do usuário e passa pelo transporte real.
      expect(h.fetch).toHaveBeenCalledTimes(1);
      await h.user.click(
        screen.getByRole("button", { name: "Tentar novamente" }),
      );
      expect(await screen.findByText("Dados aninhados (SICONV)")).toBeVisible();
      expect(h.fetch).toHaveBeenCalledTimes(2);
    },
  );

  it("distingue sucesso sem dump de falha de consulta", async () => {
    // Arrange
    const h = montar();
    h.fetch.mockResolvedValueOnce(
      h.json(criarDetalheConvenioResposta({ siconv_raw: null })),
    );
    // Act
    await h.user.click(screen.getByText("Mais detalhes"));
    // Assert
    expect(
      await screen.findByText("Não encontrado no dump SICONV."),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reutiliza detalhe íntegro ao recolher e reabrir dentro do cache", async () => {
    // Arrange
    const h = montar();
    await h.user.click(screen.getByText("Mais detalhes"));
    await screen.findByText("Dados aninhados (SICONV)");
    // Act
    await h.user.click(screen.getByText("Menos detalhes"));
    await screen.findByText("Mais detalhes");
    await h.user.click(screen.getByText("Mais detalhes"));
    // Assert
    expect(await screen.findByText("Dados aninhados (SICONV)")).toBeVisible();
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it("mantém resumo e detalhe na mesma versão após receber valores atualizados", async () => {
    // Arrange
    const h = montar();
    h.fetch.mockResolvedValueOnce(
      h.json(
        criarDetalheConvenioResposta({
          programa: "Programa atualizado",
          situacao: "Concluído",
          valor_global: 2000,
          valor_pago_fornecedor: 123,
          pagamentos_count: 1,
        }),
      ),
    );
    // Act
    await h.user.click(screen.getByText("Mais detalhes"));
    await screen.findByText("Dados aninhados (SICONV)");
    // Assert
    expect(screen.getByText("Programa atualizado")).toBeInTheDocument();
    // A fase interna continua sendo a fonte do badge de item monitorado.
    expect(screen.getByText("Não iniciado")).toBeInTheDocument();
    expect(screen.getByText("R$ 123")).toBeInTheDocument();
    expect(screen.getByText("1 pagamento(s)")).toBeInTheDocument();
    expect(screen.queryByText("Programa sintético")).not.toBeInTheDocument();
  });

  it("isola resposta atrasada de outro instrumento no mesmo card", async () => {
    // Arrange
    const h = montar();
    let antigo!: (response: Response) => void;
    h.fetch
      .mockReturnValueOnce(
        new Promise((resolve) => {
          antigo = resolve;
        }),
      )
      .mockResolvedValueOnce(
        h.json(
          criarDetalheConvenioResposta({
            numero: "QA002",
            numero_processo: "PROCESSO-ATUAL",
          }),
        ),
      );
    await h.user.click(screen.getByText("Mais detalhes"));
    await screen.findByText("Carregando detalhes...");
    // Act
    h.tela.rerender(
      <ConvenioCard c={criarResumoConvenio({ numero: "QA002" })} monitorado />,
    );
    await screen.findByText("PROCESSO-ATUAL");
    antigo(
      h.json(
        criarDetalheConvenioResposta({ numero_processo: "PROCESSO-ANTIGO" }),
      ),
    );
    await waitFor(() => expect(h.client.isFetching()).toBe(0));
    // Assert
    expect(screen.getByText("PROCESSO-ATUAL")).toBeInTheDocument();
    expect(screen.queryByText("PROCESSO-ANTIGO")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ver detalhes →" }),
    ).toHaveAttribute("href", "/monitoramento-equipamentos/instrumentos/QA002");
  });
});
