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
    name: "Visão geral",
  });
}
function metrica(rotulo: string) {
  return within(screen.getByText(rotulo, { exact: true }).parentElement!);
}

describe("Painel de gestão com composição e HTTP reais simulados", () => {
  it("recalcula o valor por recorte e remove valor cuja fonte deixou de ser confiável", async () => {
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
    expect(metrica("Valor global").getByText(/2\.000/)).toBeInTheDocument();
    // When: o recorte exclui uma UF.
    await user.click(screen.getByRole("button", { name: /^UF/ }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "UF" }),
      "BA",
    );
    // Then
    expect(metrica("Valor global").getByText(/1\.000/)).toBeInTheDocument();
    // When: atualização da fonte retira a base comparável do instrumento filtrado.
    lista.itens[1]!.financeiro_fonte_confiavel = false;
    await act(async () => {
      await h.client.invalidateQueries({ queryKey: ["convenios-lista"] });
    });
    // Then: não conservar a soma antiga nem transformar desconhecido em zero.
    await waitFor(() =>
      expect(metrica("Valor global").getByText("—")).toBeInTheDocument(),
    );
  });

  it("cruza o início de operação com os anos reais das unidades e oferece só as três referências", async () => {
    const h = prepararPainel();
    h.resumo.etapas_por_instrumento = [
      {
        nr_convenio: "QA001",
        publicacao: null,
        entrega: "2023-01-01",
        inauguracao: null,
        conclusao: null,
        inauguracao_dispensada: true,
        conclusao_resultado: "integral",
        tem_acelerador_linear: false,
        unidades_entregues: [
          { data: "2023-01-01", quantidade: 1 },
          { data: "2025-01-01", quantidade: 1 },
        ],
      },
    ];
    h.resumo.inauguracoes = [
      {
        nr_convenio: "QA002",
        nome_convenente: "Unidade Beta sintética",
        municipio: "Cidade Beta",
        uf: "BA",
        equipamento: null,
        data: "2027-02-01",
        realizada: false,
        dias: 100,
      },
    ];
    const user = montar(h);
    await pronto();
    await user.click(screen.getByRole("button", { name: "Período" }));
    const referencia = screen.getByRole("combobox", { name: "Referência" });
    expect(
      within(referencia)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([
      "Ano do instrumento",
      "Início de operação",
      "Inauguração prevista",
    ]);
    await user.selectOptions(referencia, "inicio_operacao");
    const inicio = screen.getByRole("combobox", { name: "Ano inicial" });
    expect(
      within(inicio).getByRole("option", { name: "2023" }),
    ).toBeInTheDocument();
    await user.selectOptions(inicio, "2025");
    expect(metrica("Instrumentos").getByText("1")).toBeInTheDocument();

    await user.selectOptions(referencia, "inauguracao_prevista");
    expect(metrica("Instrumentos").getByText("2")).toBeInTheDocument();
    expect(
      within(inicio).queryByRole("option", { name: "2025" }),
    ).not.toBeInTheDocument();
    await user.selectOptions(inicio, "2027");
    const anoFinal = screen.getByRole("combobox", { name: "Ano final" });
    await user.selectOptions(anoFinal, "2027");
    expect(
      screen.getByRole("button", { name: "Remover filtro Período: 2027" }),
    ).toBeInTheDocument();
    expect(metrica("Instrumentos").getByText("1")).toBeInTheDocument();
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
        name: "Visão geral",
      }),
    ).not.toBeInTheDocument();
    // When
    await act(async () => {
      liberar(h.json(h.respostas.get(rota)!.body));
    });
    // Then
    expect(await pronto()).toBeInTheDocument();
    expect(metrica("Instrumentos").getByText("2")).toBeInTheDocument();
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
    expect(screen.queryByText("Valor global")).not.toBeInTheDocument();
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
    expect(metrica("Instrumentos").getByText("2")).toBeInTheDocument();
    // When
    await user.click(screen.getByRole("button", { name: /^UF/ }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "UF" }),
      "BA",
    );
    // Then
    expect(metrica("Instrumentos").getByText("1")).toBeInTheDocument();
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
      expect(metrica("Instrumentos").getByText("0")).toBeInTheDocument(),
    );
    expect(metrica("Valor global").getByText("—")).toBeInTheDocument();
  });
});
