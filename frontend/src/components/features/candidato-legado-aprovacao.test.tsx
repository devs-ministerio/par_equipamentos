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
  fireEvent.click(
    await screen.findByRole("button", { name: "Conferir para aprovar" }),
  );
}
async function preencher() {
  await screen.findByLabelText("Justificativa da aprovação");
  fireEvent.change(screen.getByLabelText("Justificativa da aprovação"), {
    target: { value: "Aquisição conferida pela gestão" },
  });
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "Conferi os dados oficiais deste convênio.",
    }),
  );
}
const enviar = () =>
  fireEvent.click(screen.getByRole("button", { name: "Aprovar e incluir" }));

describe("conferência e aprovação no Radar", () => {
  it.each(["admin", "gestor"])(
    "permite ao %s abrir a prova sem inclusão automática",
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
      expect(await screen.findByText("Instituição sintética")).toBeVisible();
      expect(screen.getByText("Em execução")).toBeVisible();
      expect(screen.getByText(/R\$\s*1\.000,50/)).toBeVisible();
      expect(
        screen.getByText(/Não inicia o monitoramento interno/),
      ).toBeVisible();
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
        screen.queryByRole("button", { name: "Conferir para aprovar" }),
      ).not.toBeInTheDocument();
      expect(
        fetch.mock.calls.some(([url]) => String(url).endsWith("/prova")),
      ).toBe(false);
    },
  );

  it.each([
    criarCandidato({ origem: "snapshot_local" }),
    criarCandidato({ confirmacao_portal: "nao_consultado" }),
    criarCandidato({ situacao: "rejeitado" }),
    criarCandidato({ situacao: "aprovado", versao: 31 }),
  ])("não oferece aprovação em estado incompatível %j", async (candidato) => {
    // Arrange / Act
    montar({ candidato });
    await screen.findByText("Convênio 999001");
    // Assert
    expect(
      screen.queryByRole("button", { name: "Conferir para aprovar" }),
    ).not.toBeInTheDocument();
  });

  it("exige confirmação e justificativa antes de enviar", async () => {
    // Arrange
    const { fetch } = montar();
    await abrir();
    await screen.findByLabelText("Justificativa da aprovação");
    // Act
    enviar();
    // Assert
    expect(
      await screen.findByText("Confirme a conferência dos dados oficiais."),
    ).toBeVisible();
    expect(fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(
      false,
    );
  });

  it("aprova com prova revisada e atualiza a lista e os caches dependentes", async () => {
    // Arrange
    const { client, fetch } = montar();
    client.setQueryData(["notificacoes", 1], { total: 0 });
    client.setQueryData(["convenios-lista"], []);
    await abrir();
    await preencher();
    // Act
    enviar();
    // Assert
    expect(await screen.findByText("Aprovado", { exact: true })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Conferir para aprovar" }),
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
      justificativa: "Aquisição conferida pela gestão",
    });
    expect(corpo).not.toHaveProperty("confirmado");
    await waitFor(() =>
      expect(client.getQueryState(["convenios-lista"])?.isInvalidated).toBe(
        true,
      ),
    );
    expect(client.getQueryState(["notificacoes", 1])?.isInvalidated).toBe(true);
  });

  it("preserva chave e texto ao repetir falha transitória, sem retry automático", async () => {
    // Arrange
    const { controle, fetch, json } = montar();
    controle.aprovar = async () =>
      json({ error: "Falha temporária. Tente novamente." }, 503);
    await abrir();
    await preencher();
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
      expect(
        screen.getByRole("button", { name: "Aprovar e incluir" }),
      ).toBeEnabled(),
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
    expect(screen.getByLabelText("Justificativa da aprovação")).toHaveValue(
      "Aquisição conferida pela gestão",
    );
  });

  it("bloqueia reenvio após conflito até nova conferência", async () => {
    // Arrange
    const { controle, json } = montar();
    controle.aprovar = async () =>
      json({ error: "Prova vencida. Consulte novamente." }, 409);
    await abrir();
    await preencher();
    // Act
    enviar();
    // Assert
    expect(
      await screen.findByText("Prova vencida. Consulte novamente.", {
        selector: "p",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Aprovar e incluir" }),
    ).toBeDisabled();
    controle.prova = {
      ...controle.prova,
      recaptura_id: 22,
      hash_revisado: "b".repeat(64),
    };
    fireEvent.click(screen.getByRole("button", { name: "Recarregar resumo" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Aprovar e incluir" }),
      ).toBeEnabled(),
    );
    expect(screen.getByLabelText("Justificativa da aprovação")).toHaveValue("");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("exibe erro de consulta com recuperação, sem habilitar aprovação", async () => {
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
      screen.queryByRole("button", { name: "Aprovar e incluir" }),
    ).not.toBeInTheDocument();
    controle.consultar = undefined;
    fireEvent.click(screen.getByRole("button", { name: "Recarregar resumo" }));
    expect(
      await screen.findByLabelText("Justificativa da aprovação"),
    ).toBeVisible();
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
      screen.queryByRole("button", { name: "Aprovar e incluir" }),
    ).not.toBeInTheDocument();
  });
});
