import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CandidatosLegados } from "./candidatos-legados";
import { fetchCandidatosLegados } from "@/services/candidatos-legados";
import { ApiError } from "@/lib/api-error";
import { CandidatoLegadoItem } from "./candidato-legado-item";
import type {
  CandidatoLegado,
  ConfirmacaoLegado,
} from "@/services/candidatos-legados";

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
  componentes: [],
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
  it("mantém confirmação apenas nos detalhes, sem recriar filtro ou alterar situação", async () => {
    const fetch = prepararApi({
      total: 1,
      novos: 1,
      itens: [{ ...candidato, origem: "siconv_oficial" }],
    });
    await screen.findByText("Convênio 123456");
    expect(
      screen.queryByRole("button", { name: /Confirmação no Portal/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Não localizado no Portal")).not.toBeVisible();
    fireEvent.click(screen.getByText("Mais detalhes"));
    expect(screen.getByText("Não localizado no Portal")).toBeVisible();
    expect(screen.getByText("Novo")).toBeVisible();
    expect(fetch.mock.calls.some(([url]) => url.includes("confirmacao="))).toBe(
      false,
    );
  });

  it.each<[ConfirmacaoLegado, string]>([
    ["nao_consultado", "Aguardando verificação"],
    ["nao_encontrado", "Não localizado no Portal"],
    ["sem_publicacao", "Publicação pendente de confirmação"],
    ["confirmado", "Publicação confirmada"],
  ])(
    "mostra %s como evidência, não situação operacional",
    (confirmacao, rotulo) => {
      render(
        <ul>
          <CandidatoLegadoItem
            candidato={{ ...candidato, confirmacao_portal: confirmacao }}
          />
        </ul>,
      );
      expect(screen.getByText("Novo")).toBeVisible();
      expect(screen.getByText(rotulo)).not.toBeVisible();
      expect(screen.queryByText(/Aprovado/)).not.toBeInTheDocument();
      expect(screen.queryByText("Ver evidências")).not.toBeInTheDocument();
      expect(screen.getByText("LINAC sintético")).not.toBeVisible();
      fireEvent.click(screen.getByText("Mais detalhes"));
      expect(screen.getByText(rotulo)).toBeVisible();
      expect(screen.getByText("LINAC sintético")).toBeVisible();
    },
  );

  it("filtra situação humana no servidor sem confundir com confirmação oficial", async () => {
    const fetch = prepararApi({
      total: 1,
      novos: 1,
      itens: [{ ...candidato, origem: "siconv_oficial" }],
    });
    await waitFor(() =>
      expect(screen.getByText(/Captura do SICONV/)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Situação/ }));
    fireEvent.click(screen.getByRole("option", { name: "Em análise" }));
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([url]) => url.includes("situacao=em_analise")),
      ).toBe(true),
    );
    fireEvent.click(screen.getByRole("button", { name: /Em análise/ }));
    fireEvent.click(screen.getByRole("option", { name: "Todas as situações" }));
    expect(screen.getByText("Não localizado no Portal")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Situação/ }),
    ).toBeInTheDocument();
  });

  it("separa candidato não confirmado de carteira e explica equipamento existente", async () => {
    prepararApi({ total: 1, novos: 0, itens: [candidato] });
    await waitFor(() =>
      expect(screen.getByText("Convênio 123456")).toBeInTheDocument(),
    );
    expect(screen.getByText("Não localizado no Portal")).toBeInTheDocument();
    expect(screen.getByText(/Equipamento existente/)).toBeInTheDocument();
    expect(screen.getByText(/frescor não confirmado/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Incluir/ }),
    ).not.toBeInTheDocument();
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
        screen.getByText(/Coleta automática ainda em homologação/),
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
