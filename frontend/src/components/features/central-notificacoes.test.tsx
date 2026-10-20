import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { limparCsrfToken } from "@/lib/csrf";
import {
  criarAviso,
  prepararApiNotificacoes,
} from "@/test-fixtures/api-notificacoes";
import { CentralNotificacoes } from "./central-notificacoes";

afterEach(() => {
  vi.unstubAllGlobals();
  limparCsrfToken();
});

function Localizacao() {
  return <output aria-label="Destino atual">{useLocation().pathname}</output>;
}
function montar(itens = [criarAviso()]) {
  const api = prepararApiNotificacoes(itens);
  const fechar = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <Dialog open>
          <DialogContent>
            <CentralNotificacoes fechar={fechar} />
          </DialogContent>
        </Dialog>
        <Localizacao />
        <Toaster />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { ...api, fechar };
}

describe("Central de notificações integrada à API", () => {
  it("mantém a mensagem completa, marca leitura e navega somente após confirmação", async () => {
    const { fetch, fechar } = montar([
      criarAviso(1, { destino: "/instrumento/1" }),
    ]);
    expect(await screen.findByText("Situação oficial alterada")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Abrir registro" }));
    await waitFor(() => expect(fechar).toHaveBeenCalledOnce());
    // O callback fecha a janela antes de o Router concluir a renderização.
    await waitFor(() =>
      expect(screen.getByLabelText("Destino atual")).toHaveTextContent(
        "/instrumento/1",
      ),
    );
    const escrita = fetch.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(escrita?.[1]?.headers).toEqual(
      expect.objectContaining({ "X-CSRF-Token": "csrf-sintetico" }),
    );
  });

  it("abre registro já lido sem emitir outra escrita", async () => {
    const { fetch, fechar } = montar([
      criarAviso(1, { lida: true, destino: "/instrumento/1" }),
    ]);
    fireEvent.click(
      await screen.findByRole("button", { name: "Abrir registro" }),
    );
    await waitFor(() => expect(fechar).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByLabelText("Destino atual")).toHaveTextContent(
        "/instrumento/1",
      ),
    );
    expect(fetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(
      false,
    );
  });

  it("não fecha nem navega se a leitura falhar", async () => {
    const { controle, fechar } = montar([
      criarAviso(1, { destino: "/instrumento/1" }),
    ]);
    controle.erroEscrita = true;
    fireEvent.click(
      await screen.findByRole("button", { name: "Abrir registro" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Abrir registro" }),
      ).toBeEnabled(),
    );
    expect(fechar).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Destino atual")).toHaveTextContent(/^\/$/);
    expect(screen.getByText("Não lida")).toBeVisible();
  });

  it("arquiva e restaura após confirmação do servidor", async () => {
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Arquivar" }));
    await screen.findByText(/Nenhuma notificação neste recorte/);
    fireEvent.click(screen.getByRole("button", { name: "Arquivadas" }));
    fireEvent.click(await screen.findByRole("button", { name: "Restaurar" }));
    await screen.findByText(/Nenhuma notificação neste recorte/);
    fireEvent.click(screen.getByRole("button", { name: "Recebidas" }));
    expect(await screen.findByText("Convênio sintético 1")).toBeVisible();
  });

  it("preserva o card quando arquivar falha", async () => {
    const { controle } = montar();
    controle.erroEscrita = true;
    fireEvent.click(await screen.findByRole("button", { name: "Arquivar" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Arquivar" })).toBeEnabled(),
    );
    expect(screen.getByText("Convênio sintético 1")).toBeVisible();
  });

  it("volta à página anterior ao ler o último aviso da caixa não lidas", async () => {
    montar(Array.from({ length: 11 }, (_, i) => criarAviso(i + 1)));
    await screen.findByText("Convênio sintético 1");
    fireEvent.click(screen.getByRole("button", { name: "Não lidas" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Próxima página" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await screen.findByText("Convênio sintético 11");
    fireEvent.click(screen.getByRole("button", { name: "Marcar como lida" }));
    await waitFor(() =>
      expect(screen.getByText("Página 1 de 1")).toBeVisible(),
    );
    expect(screen.getByText("10 não lidas")).toBeVisible();
  });

  it("volta à primeira página ao arquivar o último card da segunda", async () => {
    montar(Array.from({ length: 11 }, (_, i) => criarAviso(i + 1)));
    await screen.findByText("Convênio sintético 1");
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await screen.findByText("Convênio sintético 11");
    fireEvent.click(screen.getByRole("button", { name: "Arquivar" }));
    expect(await screen.findByText("Página 1 de 1")).toBeVisible();
  });

  it("marca todas, atualiza badge e desabilita a operação sem não lidas", async () => {
    montar();
    await screen.findByText("1 não lida");
    fireEvent.click(
      screen.getByRole("button", { name: "Marcar todas como lidas" }),
    );
    await screen.findByText("0 não lidas");
    expect(
      screen.getByRole("button", { name: "Marcar todas como lidas" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Não lidas" }));
    expect(
      await screen.findByText(/Nenhuma notificação neste recorte/),
    ).toBeVisible();
  });

  it("preserva não lidas quando a leitura em lote falha", async () => {
    const { controle } = montar();
    controle.erroEscrita = true;
    await screen.findByText("1 não lida");
    fireEvent.click(
      screen.getByRole("button", { name: "Marcar todas como lidas" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Marcar todas como lidas" }),
      ).toBeEnabled(),
    );
    expect(screen.getByText("1 não lida")).toBeVisible();
  });

  it("busca na API e reinicia a paginação", async () => {
    const { fetch } = montar(
      Array.from({ length: 11 }, (_, i) => criarAviso(i + 1)),
    );
    await screen.findByText("Convênio sintético 1");
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await screen.findByText("Convênio sintético 11");
    fireEvent.change(screen.getByLabelText("Buscar notificações"), {
      target: { value: "sintético 2" },
    });
    expect(await screen.findByText("Convênio sintético 2")).toBeVisible();
    expect(screen.getByText("Página 1 de 1")).toBeVisible();
    expect(
      fetch.mock.calls.some(
        ([url]) =>
          new URL(String(url)).searchParams.get("busca") === "sintético 2",
      ),
    ).toBe(true);
  });

  it("expõe erro recuperável e repete a consulta quando solicitado", async () => {
    const { controle } = montar();
    controle.erroConsulta = true;
    fireEvent.change(screen.getByLabelText("Buscar notificações"), {
      target: { value: "sintético" },
    });
    expect(await screen.findByRole("alert")).toBeVisible();
    controle.erroConsulta = false;
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Convênio sintético 1")).toBeVisible();
  });
});
