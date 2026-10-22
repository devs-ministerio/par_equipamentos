import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { limparCsrfToken } from "@/lib/csrf";
import {
  criarAviso,
  prepararApiNotificacoes,
} from "@/test-fixtures/api-notificacoes";
import { NotificationBell } from "./notification-bell";

afterEach(() => {
  vi.unstubAllGlobals();
  limparCsrfToken();
});
function Localizacao() {
  return <output aria-label="Destino atual">{useLocation().pathname}</output>;
}
function montar(itens = [criarAviso()]) {
  const api = prepararApiNotificacoes(itens);
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
        }
      >
        <NotificationBell />
        <Localizacao />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return api;
}
const abrir = async () =>
  fireEvent.click(await screen.findByRole("button", { name: /Notificações/ }));

describe("sino integrado de notificações", () => {
  it.each([1, 2, 100])(
    "exibe contagem %i e abre a central completa",
    async (quantidade) => {
      montar(Array.from({ length: quantidade }, (_, i) => criarAviso(i + 1)));
      const rotulo = `Notificações (${quantidade} não lida${quantidade > 1 ? "s" : ""})`;
      const sino = await screen.findByRole("button", { name: rotulo });
      expect(sino).toHaveTextContent(
        quantidade > 99 ? "99+" : String(quantidade),
      );
      fireEvent.click(sino);
      fireEvent.click(
        screen.getByRole("button", { name: "Ver todas as notificações" }),
      );
      expect(
        await screen.findByRole("heading", { name: "Central de notificações" }),
      ).toBeVisible();
    },
  );

  it("mostra caixa vazia sem inventar badge", async () => {
    montar([]);
    await abrir();
    expect(
      await screen.findByText("Nenhuma notificação por enquanto."),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Notificações" }),
    ).not.toHaveTextContent("0");
  });

  it.each([false, true])("abre destino com leitura prévia=%s", async (lida) => {
    const { fetch } = montar([
      criarAviso(1, { lida, destino: "/instrumento/1" }),
    ]);
    await abrir();
    fireEvent.click(
      await screen.findByRole("button", { name: /Convênio sintético 1/ }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Destino atual")).toHaveTextContent(
        "/instrumento/1",
      ),
    );
    expect(fetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(
      !lida,
    );
  });

  it("marca mensagem sem destino sem navegar", async () => {
    const { fetch } = montar([criarAviso(1, { corpo: null })]);
    await abrir();
    fireEvent.click(
      await screen.findByRole("button", { name: /Convênio sintético 1/ }),
    );
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([, init]) => init?.method === "PATCH"),
      ).toBe(true),
    );
    expect(screen.getByLabelText("Destino atual")).toHaveTextContent(/^\/$/);
  });

  it("mantém o resumo aberto e não navega quando a escrita falha", async () => {
    const { controle } = montar([criarAviso(1, { destino: "/instrumento/1" })]);
    controle.erroEscrita = true;
    await abrir();
    fireEvent.click(
      await screen.findByRole("button", { name: /Convênio sintético 1/ }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Notificações \(1/ }),
      ).toBeVisible(),
    );
    expect(screen.getByLabelText("Destino atual")).toHaveTextContent(/^\/$/);
    expect(
      screen.getByRole("button", { name: "Ver todas as notificações" }),
    ).toBeVisible();
  });

  it("permite abrir a central para recuperar erro de consulta", async () => {
    const { controle } = montar();
    controle.erroConsulta = true;
    await abrir();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Ver todas as notificações" }),
    );
    expect(
      await screen.findByRole("button", { name: "Tentar novamente" }),
    ).toBeVisible();
  });
});
