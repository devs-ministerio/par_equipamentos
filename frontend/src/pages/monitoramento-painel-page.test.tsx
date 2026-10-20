import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { limparMonitoramentoHttp } from "@/test-fixtures/monitoramento-hooks";
import {
  prepararPainel,
  ROTAS_PAINEL,
} from "@/test-fixtures/monitoramento-painel";
import { monitoramentoKeys } from "@/hooks/monitoramento-query-keys";
import { MonitoramentoPainelPage } from "./monitoramento-painel-page";

afterEach(() => {
  cleanup();
  limparMonitoramentoHttp();
  vi.useRealTimers();
});
function montar(h = prepararPainel()) {
  render(
    <MemoryRouter initialEntries={["/monitoramento-equipamentos/painel"]}>
      <MonitoramentoPainelPage />
    </MemoryRouter>,
    { wrapper: h.wrapper },
  );
  return userEvent.setup();
}
async function pronto() {
  return screen.findByRole("heading", {
    name: "Panorama dos Instrumentos e Programas",
  });
}
function metrica(rotulo: string) {
  return within(screen.getByText(rotulo, { exact: true }).parentElement!);
}

describe("Painel de gestão com composição e HTTP reais simulados", () => {
  it("recalcula valor/vigências por recorte e remove valor cuja fonte deixou de ser confiável", async () => {
    // Given: relógio fixo apenas para Date; chamadas assíncronas continuam reais.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
    const h = prepararPainel();
    const lista = h.respostas.get("/convenios")!.body as {
      total: number;
      itens: Record<string, unknown>[];
    };
    lista.itens[0]!.data_final_vigencia = "2026-10-30";
    const user = montar(h);
    await pronto();
    expect(
      metrica("Valor global informado").getByText(/2\.000/),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: /Instrumentos com vigência a encerrar/,
      }),
    );
    expect(
      within(screen.getByRole("dialog")).getByRole("link", { name: /QA001/ }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    // When: a vigência pertence à UF excluída.
    await user.click(screen.getByRole("button", { name: /^UF/ }));
    await user.click(screen.getByRole("option", { name: "BA" }));
    // Then
    expect(
      metrica("Valor global informado").getByText(/1\.000/),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: /Instrumentos com vigência a encerrar/,
      }),
    );
    expect(
      within(screen.getByRole("dialog")).queryByRole("link"),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).getByText(
        /Nenhuma vigência com encerramento/,
      ),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    // When: atualização da fonte retira a base comparável do instrumento filtrado.
    lista.itens[1]!.financeiro_fonte_confiavel = false;
    await act(async () => {
      await h.client.invalidateQueries({ queryKey: ["convenios-lista"] });
    });
    // Then: não conservar a soma antiga nem transformar desconhecido em zero.
    await waitFor(() =>
      expect(
        metrica("Valor global informado").getByText("—"),
      ).toBeInTheDocument(),
    );
    expect(
      metrica("Valor global informado").getByText(
        "Pagamento ao fornecedor sem base comparável",
      ),
    ).toBeInTheDocument();
  });

  it.each(ROTAS_PAINEL)("aguarda a fonte principal %s", async (rota) => {
    // Given
    const h = prepararPainel();
    let liberar!: (resposta: Response) => void;
    h.respostas.get(rota)!.pendente = new Promise<Response>((resolve) => {
      liberar = resolve;
    });
    montar(h);
    expect(
      screen.getByRole("status", { name: "Carregando" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "Panorama dos Instrumentos e Programas",
      }),
    ).not.toBeInTheDocument();
    // When
    await act(async () => {
      liberar(h.json(h.respostas.get(rota)!.body));
    });
    // Then
    expect(await pronto()).toBeInTheDocument();
    expect(screen.getByText("2 de 2 instrumentos")).toBeInTheDocument();
  });

  it.each(ROTAS_PAINEL)(
    "recupera falha de %s sem expor detalhe técnico",
    async (rota) => {
      // Given
      const h = prepararPainel();
      const original = h.respostas.get(rota)!;
      h.respostas.set(rota, {
        body: { detail: "diagnostico-tecnico-sintetico" },
        status: 503,
      });
      const user = montar(h);
      expect(
        await screen.findByText(
          "Não foi possível carregar o painel de gestão.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/diagnostico-tecnico-sintetico/),
      ).not.toBeInTheDocument();
      // When
      h.respostas.set(rota, original);
      await user.click(
        screen.getByRole("button", { name: "Tentar novamente" }),
      );
      // Then
      expect(await pronto()).toBeInTheDocument();
      expect(
        screen.queryByText("Não foi possível carregar o painel de gestão."),
      ).not.toBeInTheDocument();
    },
  );

  it("rejeita resumo fora do contrato em vez de mostrar indicadores parciais", async () => {
    // Given
    const h = prepararPainel();
    h.respostas.set("/monitoramento/resumo", {
      body: { total_instrumentos: "inválido" },
      status: 200,
    });
    // When
    montar(h);
    // Then
    expect(
      await screen.findByText("Não foi possível carregar o painel de gestão."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Valor global informado"),
    ).not.toBeInTheDocument();
  });

  it.each(["admin", "gestor", "colaborador", "leitor"])(
    "mostra completude somente ao admin, com papel %s vindo da API",
    async (papel) => {
      // Given / When
      montar(prepararPainel(papel));
      await pronto();
      // Then: apresentação, não prova de autorização backend.
      if (papel === "admin")
        expect(
          await screen.findByRole("heading", { name: "Completude do recorte" }),
        ).toBeInTheDocument();
      else
        expect(
          screen.queryByRole("heading", { name: "Completude do recorte" }),
        ).not.toBeInTheDocument();
    },
  );

  it("não antecipa os campos de admin enquanto a confirmação da sessão está pendente", async () => {
    // Given
    const h = prepararPainel();
    let liberar!: (resposta: Response) => void;
    h.respostas.get("/auth/me")!.pendente = new Promise<Response>((resolve) => {
      liberar = resolve;
    });
    montar(h);
    await pronto();
    expect(
      screen.queryByRole("heading", { name: "Completude do recorte" }),
    ).not.toBeInTheDocument();
    // When
    await act(async () => {
      liberar(h.json(h.respostas.get("/auth/me")!.body));
    });
    // Then
    expect(
      await screen.findByRole("heading", { name: "Completude do recorte" }),
    ).toBeInTheDocument();
  });

  it("permite recuperar a geometria sem perder os demais indicadores", async () => {
    // Given
    const h = prepararPainel();
    const original = h.respostas.get("/geo/macrorregioes.geojson")!;
    h.respostas.set("/geo/macrorregioes.geojson", { body: {}, status: 503 });
    const user = montar(h);
    await pronto();
    expect(
      await screen.findByText(
        "Não foi possível carregar a geometria das macrorregiões.",
      ),
    ).toBeInTheDocument();
    expect(metrica("Instrumentos").getByText("2")).toBeInTheDocument();
    // When
    h.respostas.set("/geo/macrorregioes.geojson", original);
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    // Then: SVG real, sem chamar mapa rodoviário ou tiles externos.
    expect(
      await screen.findByRole("group", {
        name: "Mapa de 1 macrorregiões de saúde e 0 estabelecimentos",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Não foi possível carregar a geometria das macrorregiões.",
      ),
    ).not.toBeInTheDocument();
  });

  it("sincroniza totais, panorama e pendências ao filtrar e atualizar instrumentos", async () => {
    // Given
    const h = prepararPainel();
    h.resumo.indicadores_por_instrumento[0]!.acoes_atrasadas = 2;
    h.resumo.indicadores_por_instrumento[0]!.acoes_pendentes = 2;
    const user = montar(h);
    await pronto();
    expect(metrica("Pontos de atenção").getByText("2")).toBeInTheDocument();
    // When
    await user.click(screen.getByRole("button", { name: /^UF/ }));
    await user.click(screen.getByRole("option", { name: "BA" }));
    // Then
    expect(screen.getByText("1 de 2 instrumentos")).toBeInTheDocument();
    expect(metrica("Pontos de atenção").getByText("0")).toBeInTheDocument();
    expect(
      metrica("Progresso de fase · referência").getByText("20%"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 instrumentos")).toBeInTheDocument();
    // When: a mesma query perde o único instrumento do recorte.
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
      expect(screen.getByText("0 de 1 instrumentos")).toBeInTheDocument(),
    );
    expect(metrica("Instrumentos").getByText("0")).toBeInTheDocument();
    expect(
      metrica("Valor global informado").getByText("—"),
    ).toBeInTheDocument();
    expect(screen.queryByText("1 instrumentos")).not.toBeInTheDocument();
  });
});
