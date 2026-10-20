import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { CandidatoLegadoTriagem } from "./candidato-legado-triagem";
import type { CandidatoLegado } from "@/services/candidatos-legados";
import { enviarDecisaoLegado } from "@/services/candidatos-legados";
import { atualizarCsrfToken, limparCsrfToken } from "@/lib/csrf";
import { ApiError } from "@/lib/api-error";

afterEach(() => {
  vi.unstubAllGlobals();
  limparCsrfToken();
});

const candidato: CandidatoLegado = {
  id: 1,
  numero: "900101",
  id_proposta: "1001",
  captura_id: 2,
  versao: 0,
  situacao: "novo",
  confirmacao_portal: "nao_consultado",
  data_publicacao: null,
  origem: "siconv_oficial",
  descoberto_em: "2026-10-06T10:00:00Z",
  verificado_em: "2026-10-06T10:00:00Z",
  componentes: [],
  evidencias: [],
};
const decisao = {
  id: 3,
  candidato_id: 1,
  captura_id: 2,
  usuario_id: 1,
  situacao_anterior: "novo",
  situacao: "em_analise",
  justificativa: "Conferência sintética",
  criado_em: "2026-10-06T10:00:00Z",
};

function preparar({ role = "gestor", item = candidato, falha = false } = {}) {
  atualizarCsrfToken("csrf-sintetico");
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/auth/me"))
      return Response.json({
        id: 1,
        name: "Equipe sintética",
        email: "qa@example.com",
        role,
        status: "active",
        created_at: "2026-10-06T10:00:00Z",
      });
    if (init?.method === "POST")
      return falha
        ? Response.json(
            { detail: "O candidato mudou. Atualize o Radar antes de decidir." },
            { status: 409 },
          )
        : Response.json(decisao);
    return Response.json({
      total: 11,
      itens: [{ ...decisao, usuario_nome: "Equipe sintética" }],
    });
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <CandidatoLegadoTriagem candidato={item} />
    </QueryClientProvider>,
  );
  return fetch;
}

it("valida justificativa, envia captura e versão com CSRF e fecha após sucesso", async () => {
  const fetch = preparar();
  fireEvent.click(
    await screen.findByRole("button", { name: "Iniciar análise" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirmar decisão" }));
  expect(await screen.findByText(/pelo menos 3 caracteres/)).toBeVisible();
  expect(
    fetch.mock.calls.filter(([, init]) => init?.method === "POST"),
  ).toHaveLength(0);
  fireEvent.change(
    screen.getByRole("textbox", { name: "Justificativa da análise" }),
    { target: { value: "Conferência sintética" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirmar decisão" }));
  await waitFor(() =>
    expect(
      fetch.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1),
  );
  const chamada = fetch.mock.calls.find(([, init]) => init?.method === "POST");
  expect(JSON.parse(String(chamada?.[1]?.body))).toMatchObject({
    acao: "iniciar_analise",
    captura_id: 2,
    versao: 0,
    justificativa: "Conferência sintética",
  });
  expect(chamada?.[1]?.headers).toMatchObject({
    "Content-Type": "application/json",
    "X-CSRF-Token": "csrf-sintetico",
  });
  await waitFor(() =>
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument(),
  );
});

it("exibe conflito preservando a justificativa para revisão", async () => {
  preparar({ falha: true });
  fireEvent.click(await screen.findByRole("button", { name: "Rejeitar" }));
  fireEvent.change(
    screen.getByRole("textbox", { name: "Motivo da rejeição" }),
    { target: { value: "Fora do escopo" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirmar decisão" }));
  expect(await screen.findByText(/O candidato mudou/)).toBeVisible();
  expect(screen.getByRole("textbox")).toHaveValue("Fora do escopo");
});

it.each(["colaborador", "leitor"])(
  "%s consulta histórico sem ações de decisão",
  async (role) => {
    preparar({
      role,
      item: { ...candidato, situacao: "rejeitado", versao: 3 },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Histórico de decisões" }),
    );
    expect(await screen.findByText("Conferência sintética")).toBeVisible();
    expect(screen.getByText(/Equipe sintética/)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Rejeitar" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Próxima/ }));
    await waitFor(() =>
      expect(screen.getByText(/Página 2 de 2/)).toBeVisible(),
    );
  },
);

it("cancelar não grava uma decisão", async () => {
  const fetch = preparar();
  fireEvent.click(
    await screen.findByRole("button", { name: "Iniciar análise" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(
    fetch.mock.calls.filter(([, init]) => init?.method === "POST"),
  ).toHaveLength(0);
});

it("histórico só é consultado quando aberto", async () => {
  const fetch = preparar({
    item: { ...candidato, versao: 3, situacao: "em_analise" },
  });
  await screen.findByRole("button", { name: "Rejeitar" });
  expect(fetch.mock.calls.some(([url]) => url.includes("/historico"))).toBe(
    false,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Histórico de decisões" }),
  );
  await screen.findByText("Conferência sintética");
  expect(
    fetch.mock.calls.some(([url]) => url.includes("/historico?pagina=1")),
  ).toBe(true);
});

it("service rejeita decisão malformada antes de enviar", async () => {
  const fetch = preparar();
  await expect(
    enviarDecisaoLegado(1, {
      acao: "rejeitar",
      chave: crypto.randomUUID(),
      captura_id: 2,
      versao: 0,
      justificativa: "  ",
    }),
  ).rejects.toBeInstanceOf(ApiError);
  expect(
    fetch.mock.calls.filter(([, init]) => init?.method === "POST"),
  ).toHaveLength(0);
});
