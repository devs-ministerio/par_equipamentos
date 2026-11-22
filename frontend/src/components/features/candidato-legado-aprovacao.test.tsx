import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "sonner";
import { limparCsrfToken } from "@/lib/csrf";
import { criarCandidato } from "@/test-fixtures/aprovacao-legado";
import { prepararApiAprovacao } from "@/test-fixtures/api-aprovacao-legado";
import { CandidatosLegados } from "./candidatos-legados";

afterEach(() => {
  vi.unstubAllGlobals();
  limparCsrfToken();
});

function montar(opcoes: Parameters<typeof prepararApiAprovacao>[0] = {}) {
  const api = prepararApiAprovacao(opcoes);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <CandidatosLegados />
      <Toaster />
    </QueryClientProvider>,
  );
  return { ...api, client };
}
async function abrir() {
  fireEvent.click(await screen.findByRole("button", { name: "Aprovar" }));
}
async function escolherTecnico(nome = "Técnica Sintética") {
  const campo = await screen.findByLabelText("Técnico titular");
  await screen.findByRole("option", { name: nome });
  fireEvent.change(campo, {
    target: { value: nome === "Técnica Sintética" ? "5" : "6" },
  });
}
const enviar = () =>
  fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

describe("conferência e aprovação no Radar", () => {
  it.each(["admin", "gestor"])(
    "permite ao %s abrir a aprovação sem incluir nada sozinho",
    async (role) => {
      // Arrange
      const { fetch } = montar({ role });
      await screen.findByText("Convênio 999001");
      expect(
        fetch.mock.calls.some(([url]) => String(url).endsWith("/prova")),
      ).toBe(false);
      // Act
      await abrir();
      // Assert
      expect(await screen.findByLabelText("Técnico titular")).toBeVisible();
      expect(screen.getByRole("button", { name: "Confirmar" })).toBeVisible();
      expect(fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(
        false,
      );
    },
  );

  it.each(["colaborador", "leitor"])(
    "não oferece aprovação ao %s",
    async (role) => {
      // Arrange / Act
      const { fetch } = montar({ role });
      await screen.findByText("Convênio 999001");
      // Assert
      expect(
        screen.queryByRole("button", { name: "Aprovar" }),
      ).not.toBeInTheDocument();
      expect(
        fetch.mock.calls.some(([url]) => String(url).endsWith("/prova")),
      ).toBe(false);
    },
  );

  it.each([
    criarCandidato({ origem: "snapshot_local" }),
    criarCandidato({ situacao: "rejeitado" }),
    criarCandidato({ situacao: "aprovado", versao: 31 }),
  ])("não oferece aprovação em estado incompatível %j", async (candidato) => {
    // Arrange / Act
    montar({ candidato });
    await screen.findByText("Convênio 999001");
    // Assert
    expect(
      screen.queryByRole("button", { name: "Aprovar" }),
    ).not.toBeInTheDocument();
  });

  it("sem confirmação do Portal o Aprovar aparece desabilitado", async () => {
    montar({
      candidato: criarCandidato({ confirmacao_portal: "nao_encontrado" }),
    });
    await screen.findByText("Convênio 999001");
    expect(screen.getByRole("button", { name: "Aprovar" })).toBeDisabled();
  });

  it.each([
    ["sem recaptura", null, "Prova ausente"],
    ["com recaptura vencida", "2020-01-01T00:00:00Z", "Prova vencida"],
  ])(
    "Aprovar fica desabilitado %s e mostra o motivo",
    async (_n, quando, texto) => {
      montar({ candidato: criarCandidato({ recaptura_em: quando }) });
      await screen.findByText("Convênio 999001");
      expect(screen.getByRole("button", { name: "Aprovar" })).toBeDisabled();
      expect(screen.getByText(new RegExp(texto))).toBeVisible();
    },
  );

  it("não aprova sem escolher o técnico", async () => {
    // Arrange
    const { fetch } = montar();
    await abrir();
    await screen.findByLabelText("Técnico titular");
    // Act
    enviar();
    // Assert
    expect(
      await screen.findByText("Informe o técnico titular responsável."),
    ).toBeVisible();
    expect(fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(
      false,
    );
  });

  it("aprova com técnico e envia o titular escolhido", async () => {
    // Arrange
    const { fetch } = montar();
    await abrir();
    await escolherTecnico();
    // Act
    enviar();
    // Assert
    await waitFor(() =>
      expect(fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(
        true,
      ),
    );
    const corpo = JSON.parse(
      String(
        fetch.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body,
      ),
    );
    expect(corpo.tecnico_titular_id).toBe(5);
  });

  it("aprova com prova revisada e atualiza a lista e os caches dependentes", async () => {
    // Arrange
    const { client, fetch } = montar();
    client.setQueryData(["notificacoes", 1], { total: 0 });
    client.setQueryData(["convenios-lista"], []);
    await abrir();
    await escolherTecnico();
    // Act
    enviar();
    // Assert
    expect(await screen.findByText("Aprovado", { exact: true })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Aprovar" }),
    ).not.toBeInTheDocument();
    const corpo = JSON.parse(
      String(
        fetch.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body,
      ),
    );
    expect(corpo).toMatchObject({
      captura_id: 11,
      recaptura_id: 21,
      versao: 0,
      hash_revisado: "a".repeat(64),
      justificativa: "Aprovado no Radar de instrumentos.",
    });
    await waitFor(() =>
      expect(client.getQueryState(["convenios-lista"])?.isInvalidated).toBe(
        true,
      ),
    );
    expect(client.getQueryState(["notificacoes", 1])?.isInvalidated).toBe(true);
  });

  it("preserva a chave ao repetir falha transitória, sem retry automático", async () => {
    // Arrange
    const { controle, fetch, json } = montar();
    controle.aprovar = async () =>
      json({ error: "Falha temporária. Tente novamente." }, 503);
    await abrir();
    await escolherTecnico();
    // Act
    enviar();
    expect(
      await screen.findByText(
        "Não foi possível completar a operação. Tente novamente em instantes.",
        {
          selector: "p",
        },
      ),
    ).toBeVisible();
    expect(
      screen.queryByText("Falha temporária. Tente novamente."),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled(),
    );
    enviar();
    // Assert
    await waitFor(() =>
      expect(
        fetch.mock.calls.filter(([, init]) => init?.method === "POST"),
      ).toHaveLength(2),
    );
    const pedidos = fetch.mock.calls
      .filter(([, init]) => init?.method === "POST")
      .map(([, init]) => init?.body);
    expect(pedidos[0]).toBe(pedidos[1]);
  });

  it("bloqueia reenvio após conflito até nova conferência", async () => {
    // Arrange
    const { controle, json } = montar();
    controle.aprovar = async () =>
      json({ error: "Prova vencida. Consulte novamente." }, 409);
    await abrir();
    await escolherTecnico();
    // Act
    enviar();
    // Assert
    expect(
      await screen.findByText("Prova vencida. Consulte novamente.", {
        selector: "p",
      }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  });

  it("exibe erro de consulta sem habilitar aprovação", async () => {
    // Arrange
    const { controle, json } = montar();
    controle.consultar = async () =>
      json({ error: "Aguarde nova consulta oficial." }, 409);
    // Act
    await abrir();
    // Assert
    expect(
      await screen.findByText("Aguarde nova consulta oficial."),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Confirmar" }),
    ).not.toBeInTheDocument();
  });

  it("falha na lista de técnicos mostra o erro, trava o seletor e permite tentar de novo", async () => {
    // Arrange
    const { controle, json } = montar();
    controle.colaboradores = () => json({ error: "Falha ao listar." }, 500);
    // Act
    await abrir();
    // Assert
    const campo = await screen.findByLabelText("Técnico titular");
    expect(
      await screen.findByRole("button", { name: "Tentar novamente" }),
    ).toBeVisible();
    expect(campo).toBeDisabled();
    // Act: a lista volta e a nova tentativa libera o seletor
    controle.colaboradores = undefined;
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    // Assert
    await screen.findByRole("option", { name: "Técnica Sintética" });
    expect(screen.getByLabelText("Técnico titular")).toBeEnabled();
  });

  it("não confere prova de versão diferente da lista", async () => {
    // Arrange
    const { controle } = montar();
    controle.prova = { ...controle.prova, versao: 99 };
    // Act
    await abrir();
    // Assert
    expect(
      await screen.findByText(
        "O Radar mudou. Atualize a lista antes de aprovar.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Confirmar" }),
    ).not.toBeInTheDocument();
  });
});
