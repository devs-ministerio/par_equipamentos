import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConclusaoAcompanhamento } from "./conclusao-acompanhamento";

const base = {
  nr_convenio: "1",
  pode_editar: true,
  conclusao: null,
  resultado: "parcial",
  exige_justificativa: true,
  itens_exigidos: 3,
  itens_completos: 1,
  impedimentos: [],
};

function responder(avaliacao: Record<string, unknown>) {
  const chamadas: { url: string; method: string; body?: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      chamadas.push({
        url: String(url),
        method,
        body: init?.body as string | undefined,
      });
      const corpo =
        method === "GET"
          ? avaliacao
          : {
              id: 1,
              resultado: "parcial",
              data_conclusao: "2026-11-19",
              justificativa: "x",
              data_inauguracao: null,
            };
      return new Response(JSON.stringify(corpo), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  return chamadas;
}

function montar() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ConclusaoAcompanhamento
        numeroConvenio="1"
        podeEditarInstrumento
        aoSessaoInvalida={vi.fn()}
        aoErro={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("conclusão do acompanhamento", () => {
  it("mostra o resultado calculado e exige justificativa quando não é integral", async () => {
    const chamadas = responder(base);
    montar();
    await userEvent.click(
      await screen.findByRole("button", { name: "Concluir acompanhamento" }),
    );
    expect(screen.getByText(/parcial/)).toBeInTheDocument();
    expect(screen.getByText(/1 de 3 item\(ns\) completo/)).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Concluir acompanhamento",
      }),
    );
    expect(
      await screen.findByText(/Informe a justificativa/),
    ).toBeInTheDocument();
    await userEvent.type(
      screen.getByLabelText("Justificativa"),
      "Mamógrafo não será entregue",
    );
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Concluir acompanhamento",
      }),
    );
    await waitFor(() => {
      const post = chamadas.find((c) => c.method === "POST");
      expect(post).toBeDefined();
      expect(JSON.parse(post!.body!)).toMatchObject({
        resultado_confirmado: "parcial",
        justificativa: "Mamógrafo não será entregue",
        data_inauguracao: null,
      });
    });
  });

  it("lista as pendências e bloqueia o envio", async () => {
    responder({
      ...base,
      impedimentos: [
        { tipo: "acao_aberta", descricao: "Ação aberta: Cobrar relatório" },
      ],
    });
    montar();
    await userEvent.click(
      await screen.findByRole("button", { name: "Concluir acompanhamento" }),
    );
    expect(
      screen.getByText("Ação aberta: Cobrar relatório"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Concluir acompanhamento",
      }),
    ).toBeDisabled();
  });

  it("concluído mostra o resultado e reabre com motivo", async () => {
    const chamadas = responder({
      ...base,
      conclusao: {
        id: 1,
        resultado: "integral",
        data_conclusao: "2026-11-19",
        justificativa: null,
        data_inauguracao: null,
      },
    });
    montar();
    expect(
      await screen.findByText(/Concluído em 19\/11\/2026 · integral/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reabrir" }));
    await userEvent.type(
      screen.getByLabelText("Motivo da reabertura"),
      "Entrega confirmada depois",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Reabrir acompanhamento" }),
    );
    await waitFor(() => {
      const del = chamadas.find((c) => c.method === "DELETE");
      expect(del).toBeDefined();
      expect(JSON.parse(del!.body!)).toEqual({
        motivo: "Entrega confirmada depois",
      });
    });
  });

  it("quem não edita não vê o botão", async () => {
    responder({ ...base, pode_editar: false });
    montar();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Concluir acompanhamento" }),
      ).not.toBeInTheDocument(),
    );
  });
});
