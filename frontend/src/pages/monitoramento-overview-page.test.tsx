import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { monitoramentoKeys } from "@/hooks/monitoramento-query-keys";
import {
  limparMonitoramentoHttp,
  criarInstrumentoTeste,
} from "@/test-fixtures/monitoramento-hooks";
import { prepararMesa, ROTAS_MESA } from "@/test-fixtures/monitoramento-mesa";
import { MonitoramentoOverviewPage } from "./monitoramento-overview-page";

afterEach(() => {
  cleanup();
  limparMonitoramentoHttp();
});
function UrlAtual() {
  const local = useLocation();
  return <output aria-label="URL atual">{local.search}</output>;
}
function montar(h = prepararMesa(), query = "") {
  render(
    <MemoryRouter
      initialEntries={[`/monitoramento-equipamentos/instrumentos${query}`]}
    >
      <MonitoramentoOverviewPage />
      <UrlAtual />
    </MemoryRouter>,
    { wrapper: h.wrapper },
  );
  return userEvent.setup();
}
async function tabelaPronta() {
  return screen.findByRole("table");
}

describe("Mesa de trabalho com fontes HTTP e componentes reais", () => {
  it.each(ROTAS_MESA)(
    "aguarda %s antes de apresentar filtros e registros",
    async (rota) => {
      // Given
      const h = prepararMesa();
      let liberar!: (resposta: Response) => void;
      h.respostas.get(rota)!.pendente = new Promise<Response>((resolve) => {
        liberar = resolve;
      });
      montar(h);
      // When / Then
      expect(
        screen.getByRole("status", { name: "Carregando" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      await act(async () => {
        const resposta = h.respostas.get(rota)!;
        liberar(h.json(resposta.body));
      });
      expect(await tabelaPronta()).toBeInTheDocument();
      expect(
        screen.queryByRole("status", { name: "Carregando" }),
      ).not.toBeInTheDocument();
    },
  );

  it.each(ROTAS_MESA)(
    "trata falha de %s e recupera por retry sem expor detalhes técnicos",
    async (rota) => {
      // Given
      const h = prepararMesa();
      const original = h.respostas.get(rota)!;
      h.respostas.set(rota, {
        body: { detail: "segredo-tecnico-sintetico" },
        status: 503,
      });
      const user = montar(h);
      expect(
        await screen.findByText(
          "Não foi possível carregar os dados do monitoramento interno.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/segredo-tecnico-sintetico/),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      // When
      h.respostas.set(rota, original);
      await user.click(
        screen.getByRole("button", { name: "Tentar novamente" }),
      );
      // Then
      expect(await tabelaPronta()).toBeInTheDocument();
      expect(
        within(screen.getByRole("table")).getByRole("link", { name: "QA001" }),
      ).toBeInTheDocument();
    },
  );

  it("rejeita marcadores fora do contrato sem recorrer à descrição composta", async () => {
    // Given
    const h = prepararMesa();
    const original = h.respostas.get("/convenios")!.body as {
      total: number;
      itens: Record<string, unknown>[];
    };
    h.respostas.set("/convenios", {
      body: {
        ...original,
        itens: original.itens.map((item) => ({
          ...item,
          equipamentos: "inválido",
        })),
      },
      status: 200,
    });
    // When
    montar(h);
    // Then
    expect(
      await screen.findByText(
        "Não foi possível carregar os dados do monitoramento interno.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Equipamento/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Texto composto que não é marcador"),
    ).not.toBeInTheDocument();
  });

  it("atualiza os seis indicadores com o mesmo recorte da lista", async () => {
    // Given: respostas sintéticas independentes, com metadados dos dois instrumentos.
    const h = prepararMesa();
    h.resumo.licencas_vencendo = [
      {
        nr_convenio: "QA001",
        nome_convenente: "Unidade Alfa sintética",
        data_validade: "2026-10-30",
        dias: 10,
      },
    ];
    h.resumo.inauguracoes = h.instrumentos.map((item, i) => ({
      nr_convenio: item.nr_convenio,
      nome_convenente: item.nome_convenente,
      municipio: item.municipio,
      uf: item.uf,
      equipamento: null,
      data: i ? "2026-10-22" : "2026-10-19",
      realizada: !i,
      dias: i ? 2 : -1,
    }));
    const user = montar(h);
    await tabelaPronta();
    const metrica = (rotulo: string) =>
      within(screen.getByText(rotulo, { exact: true }).parentElement!);
    expect(
      metrica("Fase média · referência").getByText("60%"),
    ).toBeInTheDocument();
    expect(metrica("Licenças a vencer").getByText("1")).toBeInTheDocument();
    // When
    await user.click(screen.getByRole("button", { name: /^UF/ }));
    await user.click(screen.getByRole("option", { name: "BA" }));
    // Then: nenhum indicador conserva o total global anterior.
    expect(metrica("Instrumentos").getByText("1")).toBeInTheDocument();
    expect(
      metrica("Fase média · referência").getByText("20%"),
    ).toBeInTheDocument();
    expect(metrica("Licenças a vencer").getByText("0")).toBeInTheDocument();
    expect(
      metrica("Próxima inauguração").getByText("22/10/2026"),
    ).toBeInTheDocument();
    expect(metrica("Concluídos").getByText("0")).toBeInTheDocument();
    expect(metrica("Sem técnico").getByText("1")).toBeInTheDocument();
    expect(
      within(screen.getByRole("table")).queryByRole("link", { name: "QA001" }),
    ).not.toBeInTheDocument();
  });

  it("preserva a situação oficial exata em desktop e mobile, sem abreviar para Concluída", async () => {
    // Given / When
    montar();
    const tabela = within(await tabelaPronta());
    // Then
    expect(
      tabela.getByText("Prestação de Contas Concluída"),
    ).toBeInTheDocument();
    expect(
      tabela.queryByText("Concluída", { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Instrumentos monitorados")).getByText(
        "Prestação de Contas Concluída",
      ),
    ).toBeInTheDocument();
  });

  it("seleciona equipamento não prioritário de instrumento misto e limpa o recorte sem perder navegação", async () => {
    // Given
    const user = montar(prepararMesa(), "?pagina=3&origem=teste");
    await tabelaPronta();
    // When
    await user.click(screen.getByRole("button", { name: /^Equipamento/ }));
    await user.click(
      screen.getByRole("option", { name: "Cadeira hospitalar" }),
    );
    // Then
    const tabela = within(screen.getByRole("table"));
    expect(tabela.getByRole("link", { name: "QA001" })).toBeInTheDocument();
    expect(
      tabela.queryByRole("link", { name: "QA002" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("1 de 2 instrumentos")).toBeInTheDocument();
    expect(screen.getByLabelText("URL atual")).not.toHaveTextContent("pagina=");
    expect(
      new URL(
        tabela.getByRole("link", { name: "QA001" }).getAttribute("href")!,
        "http://sigeo.local",
      ).searchParams.get("retorno"),
    ).toContain("equipamento=cadeira");
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(screen.getByLabelText("URL atual")).toHaveTextContent(
      "?origem=teste",
    );
    expect(screen.getByText("2 de 2 instrumentos")).toBeInTheDocument();
  });

  it("mostra vazio real sem paginação quando a carteira não possui instrumentos", async () => {
    // Given
    const h = prepararMesa();
    h.respostas.set("/monitoramento/instrumentos", { body: [], status: 200 });
    // When
    montar(h);
    // Then
    expect(await tabelaPronta()).toBeInTheDocument();
    expect(
      screen.getAllByText("Nenhum instrumento bate com esse filtro."),
    ).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Próxima página" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("0 de 0 instrumentos")).toBeInTheDocument();
  });

  it("limita a página efetiva quando um refresh reduz a mesma carteira", async () => {
    // Given
    const h = prepararMesa();
    h.respostas.set("/monitoramento/instrumentos", {
      body: Array.from({ length: 21 }, (_, i) =>
        criarInstrumentoTeste({ id: i + 1, nr_convenio: `QA-${i}` }),
      ),
      status: 200,
    });
    montar(h, "?pagina=2");
    const tabela = within(await tabelaPronta());
    expect(tabela.getByRole("link", { name: "QA-20" })).toBeInTheDocument();
    // When
    h.respostas.set("/monitoramento/instrumentos", {
      body: [h.instrumentos[0]!],
      status: 200,
    });
    await act(async () => {
      await h.client.invalidateQueries({
        queryKey: monitoramentoKeys.instrumentos,
      });
    });
    // Then
    await waitFor(() =>
      expect(
        within(screen.getByRole("table")).getByRole("link", { name: "QA001" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Página 1 de 1")).toBeInTheDocument();
    expect(screen.getByText("Mostrando 1–1 de 1")).toBeInTheDocument();
  });
});
