import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CandidatosLegados } from "./candidatos-legados";
import { fetchCandidatosLegados } from "@/services/candidatos-legados";
import { ApiError } from "@/lib/api-error";
import type { CandidatoLegado } from "@/services/candidatos-legados";

afterEach(() => vi.unstubAllGlobals());

const candidato: CandidatoLegado = {
  id: 1,
  numero: "123456",
  id_proposta: "10",
  captura_id: 1,
  versao: 0,
  situacao: "novo",
  confirmacao_portal: "nao_encontrado",
  data_publicacao: null,
  origem: "snapshot_local",
  descoberto_em: "2026-10-06T10:00:00Z",
  verificado_em: "2026-10-06T10:00:00Z",
  valor_global: null,
  municipio: null,
  uf: null,
  data_instrumento: null,
  componentes: [],
  itens: ["Acelerador Linear", "Mesa Cirúrgica"],
  evidencias: [
    {
      id_item: "1",
      codigo: "acelerador_linear",
      nome: "Acelerador Linear",
      descricao: "LINAC sintético",
      relacao: "existente",
    },
  ],
};

function prepararApi(payload: unknown, status = 200) {
  const fetch = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith("/auth/me")
            ? {
                id: 1,
                name: "Demonstração",
                email: "qa@example.com",
                role: "admin",
                status: "active",
                created_at: "2026-10-06T10:00:00Z",
              }
            : payload,
        ),
        { status: url.endsWith("/auth/me") ? 200 : status },
      ),
  );
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <CandidatosLegados />
    </QueryClientProvider>,
  );
  return fetch;
}

describe("Radar legado", () => {
  it("mostra só componente, valor, local e datas, sem detalhes ocultos", async () => {
    const fetch = prepararApi({
      total: 1,
      novos: 1,
      itens: [
        {
          ...candidato,
          origem: "siconv_oficial",
          valor_global: "1500000.00",
          municipio: "Campinas",
          uf: "SP",
          data_instrumento: "2026-09-30",
        },
      ],
    });
    await screen.findByText("Convênio 123456");
    for (const rotulo of [
      "Componente",
      "Valor",
      "UF",
      "Município",
      "Data do instrumento",
      "Data da coleta",
    ])
      expect(screen.getByText(rotulo)).toBeVisible();
    expect(screen.getByText("Campinas")).toBeVisible();
    expect(screen.getByText("SP")).toBeVisible();
    expect(screen.getByText("30/09/2026")).toBeVisible();
    expect(screen.queryByText("Item")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ver itens \(2\)/ }));
    expect(await screen.findByText("Acelerador Linear")).toBeVisible();
    expect(screen.getByText("Mesa Cirúrgica")).toBeVisible();
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    expect(screen.getByText("Novo")).toBeVisible();
    expect(screen.queryByText("Mais detalhes")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Não localizado no Portal"),
    ).not.toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => url.includes("confirmacao="))).toBe(
      false,
    );
  });

  it("sem recaptura a lista mostra traço em vez de inventar valor e local", async () => {
    prepararApi({ total: 1, novos: 1, itens: [candidato] });
    await screen.findByText("Convênio 123456");
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("separa ativos de arquivados no servidor", async () => {
    const fetch = prepararApi({
      total: 1,
      novos: 1,
      itens: [{ ...candidato, origem: "siconv_oficial" }],
    });
    await screen.findByText("Convênio 123456");
    expect(
      fetch.mock.calls.some(([url]) => url.includes("situacao=novo")),
    ).toBe(true);
    fireEvent.click(screen.getByRole("tab", { name: "Arquivados" }));
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([url]) => url.includes("situacao=aprovado")),
      ).toBe(true),
    );
    expect(
      fetch.mock.calls.some(([url]) => url.includes("situacao=rejeitado")),
    ).toBe(true);
  });

  it("envia busca e página ao servidor, sem filtrar lista parcial na UI", async () => {
    const fetch = prepararApi({ total: 11, novos: 0, itens: [candidato] });
    await waitFor(() =>
      expect(screen.getByText("Convênio 123456")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Próxima/ }));
    await waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => url.includes("pagina=2"))).toBe(
        true,
      ),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Buscar candidato legado" }),
      { target: { value: "123456" } },
    );
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([url]) => url.includes("pagina=1") && url.includes("busca=123456"),
        ),
      ).toBe(true),
    );
  });

  it("não declara descoberta ativa quando a lista está vazia", async () => {
    prepararApi({ total: 0, novos: 0, itens: [] });
    await waitFor(() =>
      expect(
        screen.getByText(/Consulte o estado da coleta acima/),
      ).toBeInTheDocument(),
    );
  });

  it("explica o escopo da fila vazia e distingue filtro sem resultado", async () => {
    prepararApi({ total: 0, novos: 0, itens: [] });
    await waitFor(() =>
      expect(
        screen.getByText("Sem candidatos elegíveis no momento."),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/recorte\s+prioritário e celebrado/),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Buscar candidato legado"), {
      target: { value: "999" },
    });
    await waitFor(() =>
      expect(
        screen.getByText(/Nenhum candidato com essa busca/),
      ).toBeInTheDocument(),
    );
  });

  it("exibe erro e tentativa novamente", async () => {
    prepararApi({}, 503);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument(), {
      timeout: 3000,
    });
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toBeInTheDocument();
  });

  it("contrato inválido não é interpretado como candidato confirmado", async () => {
    prepararApi({
      total: 1,
      novos: 1,
      itens: [{ ...candidato, confirmacao_portal: "inventado" }],
    });
    await expect(
      fetchCandidatosLegados(1, "", undefined),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
