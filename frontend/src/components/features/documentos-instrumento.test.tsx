import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentosInstrumento } from "./documentos-instrumento";

const documento = {
  id: 5,
  tipo: "trp",
  numero: "77",
  data_documento: "2026-10-01",
  status: null,
  data_validade: null,
  observacao: "Recebido sem ressalvas",
};

function responder(pode_editar: boolean, documentos: unknown[]) {
  const chamadas: { url: string; method: string; body?: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      chamadas.push({
        url: String(url),
        method: init?.method ?? "GET",
        body: init?.body as string | undefined,
      });
      const corpo =
        (init?.method ?? "GET") === "GET"
          ? { nr_convenio: "1", pode_editar, documentos }
          : documento;
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
      <DocumentosInstrumento
        numeroConvenio="1"
        podeEditarInstrumento
        aoSessaoInvalida={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("documentos do instrumento", () => {
  it("lista os documentos e esconde as ações de quem não edita", async () => {
    responder(false, [documento]);
    montar();
    expect(await screen.findByText("TRP")).toBeInTheDocument();
    expect(screen.getByText("Nº 77")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Registrar documento" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTitle("Corrigir")).not.toBeInTheDocument();
  });

  it("licença deferida mostra o prazo de validade", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
    responder(false, [
      {
        ...documento,
        id: 6,
        tipo: "cnen_licenca",
        status: "Deferido",
        data_validade: "2026-10-19",
      },
    ]);
    montar();
    expect(await screen.findByText(/Vencida há 1 dia/)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("estado vazio", async () => {
    responder(true, []);
    montar();
    expect(
      await screen.findByText("Nenhum documento registrado."),
    ).toBeInTheDocument();
  });

  it("valida o cadastro e envia o documento", async () => {
    const chamadas = responder(true, []);
    montar();
    await userEvent.click(
      await screen.findByRole("button", { name: "Registrar documento" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar documento" }),
    );
    expect(
      await screen.findByText("Escolha o tipo do documento."),
    ).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Tipo"), "nota_fiscal");
    await userEvent.type(screen.getByLabelText("Número"), "123");
    await userEvent.type(
      screen.getByLabelText("Data do documento"),
      "2026-11-01",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar documento" }),
    );
    await waitFor(() => {
      const post = chamadas.find((c) => c.method === "POST");
      expect(post).toBeDefined();
      expect(JSON.parse(post!.body!)).toMatchObject({
        tipo: "nota_fiscal",
        numero: "123",
        data_documento: "2026-11-01",
        status: null,
        data_validade: null,
      });
    });
  });

  it("licença mostra situação e validade; nota fiscal não", async () => {
    responder(true, []);
    montar();
    await userEvent.click(
      await screen.findByRole("button", { name: "Registrar documento" }),
    );
    expect(screen.queryByLabelText("Validade")).not.toBeInTheDocument();
    await userEvent.selectOptions(
      screen.getByLabelText("Tipo"),
      "cnen_licenca",
    );
    expect(screen.getByLabelText("Validade")).toBeInTheDocument();
    expect(screen.getByLabelText("Situação na CNEN")).toBeInTheDocument();
  });
});
