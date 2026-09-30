import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { axe } from "jest-axe";
import { Scale } from "lucide-react";
import { AppHeader, type HeaderNavItem } from "./app-header";

// Fronteira externa (sessão via API) mockada -- o que está sob teste é o
// AppHeader (menu mobile, nav), não `useAuthSession`.
const sessaoMock = vi.hoisted(() => ({ autenticado: false }));

vi.mock("@/hooks/useAuthSession", () => ({
  useAuthSession: () => ({
    usuarioAtual: sessaoMock.autenticado
      ? { name: "Pessoa Administradora", role: "admin" }
      : null,
    autenticado: sessaoMock.autenticado,
    podeEditar: false,
    checandoSessao: false,
    sair: vi.fn(),
  }),
}));

// Relógio da sessão e sino mockados -- fronteiras com rede/timer; o que está
// sob teste é onde o header os posiciona.
vi.mock("@/hooks/useTempoSessao", () => ({
  useTempoSessao: () => ({
    restanteMs: 10 * 60 * 1000,
    expirada: false,
    emAlerta: false,
    renovando: false,
    falhouRenovacao: false,
    renovar: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-notificacoes", () => ({
  useNotificacoes: () => ({
    notificacoes: [],
    naoLidas: 2,
    carregando: false,
    marcarLida: vi.fn(),
    habilitado: sessaoMock.autenticado,
  }),
}));

const NAV_ITEMS: HeaderNavItem[] = [
  { path: "/dashboard", label: "Análise de mérito", icon: Scale },
  { path: "/monitoramento-equipamentos", label: "Dados oficiais" },
];

function renderHeader() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppHeader navItems={NAV_ITEMS} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AppHeader", () => {
  beforeEach(() => {
    sessaoMock.autenticado = false;
  });

  it("mostra a nav completa (desktop) e o botão de menu mobile", () => {
    renderHeader();
    expect(
      screen.getByRole("button", { name: "Análise de mérito" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Abrir menu" }),
    ).toBeInTheDocument();
  });

  it("mostra o ícone do item sem entrar no nome acessível", () => {
    renderHeader();
    const item = screen.getByRole("button", { name: "Análise de mérito" });
    expect(item.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });

  it("abre o menu mobile e navega ao clicar num item", async () => {
    renderHeader();
    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    expect(screen.getByRole("heading", { name: "Menu" })).toBeInTheDocument();
    const menu = screen.getByRole("dialog");
    expect(
      within(menu).getByRole("navigation", { name: "Navegação principal" }),
    ).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: "Entrar" })).toBeVisible();

    // 2 botões com o mesmo rótulo agora (nav desktop escondida por CSS +
    // nav do menu mobile) -- clica no de dentro do dialog.
    const itensMenu = screen.getAllByRole("button", { name: "Dados oficiais" });
    await userEvent.click(itensMenu[itensMenu.length - 1]);

    // Sheet fecha após navegar -- o heading "Menu" some.
    expect(
      screen.queryByRole("heading", { name: "Menu" }),
    ).not.toBeInTheDocument();
  });

  it("separa conta e navegação no menu mobile do administrador", async () => {
    sessaoMock.autenticado = true;
    renderHeader();
    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    const menu = screen.getByRole("dialog");
    expect(within(menu).getByText("Pessoa Administradora")).toBeVisible();
    expect(within(menu).getByText("Administrador")).toBeVisible();
    expect(
      within(menu).getByRole("button", { name: "Usuários" }),
    ).toBeVisible();
    expect(within(menu).getByRole("button", { name: "Sair" })).toBeVisible();
    await userEvent.click(
      within(menu).getByRole("button", { name: "Usuários" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("mostra sino e avatar com iniciais sem depender do layout", () => {
    sessaoMock.autenticado = true;
    renderHeader();
    expect(
      screen.getAllByRole("button", { name: "Notificações (2 não lidas)" })
        .length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", {
        name: "Menu de Pessoa Administradora, sessão expira em 10:00",
      }),
    ).toHaveTextContent("PA");
  });

  it("desenha a pill deslizante sob o item ativo", () => {
    // jsdom não faz layout: simula a medida do botão ativo.
    const largura = vi
      .spyOn(HTMLElement.prototype, "offsetWidth", "get")
      .mockReturnValue(120);
    const esquerda = vi
      .spyOn(HTMLElement.prototype, "offsetLeft", "get")
      .mockReturnValue(40);
    renderHeader();
    const pill = screen.getByTestId("indicador-ativo");
    expect(pill.style.width).toBe("120px");
    expect(pill.className).toContain("transition-");
    largura.mockRestore();
    esquerda.mockRestore();
  });

  it("não tem violação de acessibilidade", async () => {
    const { container } = renderHeader();
    expect(await axe(container)).toHaveNoViolations();
  });
});
