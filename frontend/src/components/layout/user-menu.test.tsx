import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { axe } from "jest-axe";
import { UserMenu } from "./user-menu";

const sessao = {
  usuarioAtual: {
    id: 1,
    name: "IGOR PEREIRA LINS",
    email: "igor@org.gov.br",
    role: "admin",
  } as Record<string, unknown> | null,
  autenticado: true,
  podeEditar: true,
  checandoSessao: false,
  sair: vi.fn(),
};
const tempo = {
  restanteMs: (18 * 60 * 1000 + 42_000) as number | null,
  expirada: false,
  emAlerta: false,
  renovando: false,
  falhouRenovacao: false,
  renovar: vi.fn(),
};

vi.mock("@/hooks/useAuthSession", () => ({ useAuthSession: () => sessao }));
vi.mock("@/hooks/useTempoSessao", () => ({ useTempoSessao: () => tempo }));

function renderMenu(mobile = false) {
  return render(
    <MemoryRouter>
      <UserMenu mobile={mobile} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  tempo.restanteMs = 18 * 60 * 1000 + 42_000;
  tempo.expirada = false;
  tempo.renovar.mockClear();
  sessao.autenticado = true;
});

describe("UserMenu", () => {
  it("mostra as iniciais e a contagem no botão do header", () => {
    renderMenu();
    expect(screen.getByTestId("avatar-iniciais")).toHaveTextContent("IL");
    expect(
      screen.getByRole("button", {
        name: "Menu de IGOR PEREIRA LINS, sessão expira em 18:42",
      }),
    ).toHaveTextContent("18:42");
  });

  it("abre o painel com dados do usuário e renova a sessão", async () => {
    renderMenu();
    await userEvent.click(screen.getByRole("button", { name: /Menu de/ }));
    expect(screen.getByText("igor@org.gov.br")).toBeInTheDocument();
    expect(screen.getByText("Administrador")).toBeInTheDocument();
    expect(screen.getByText(/Expira em/)).toHaveTextContent("18:42");
    await userEvent.click(
      screen.getByRole("button", { name: "Renovar sessão" }),
    );
    expect(tempo.renovar).toHaveBeenCalledOnce();
  });

  it("sessão expirada explica que renova na próxima ação", () => {
    tempo.restanteMs = 0;
    tempo.expirada = true;
    renderMenu(true);
    expect(
      screen.getByText("Expirada — será renovada na próxima ação"),
    ).toBeInTheDocument();
  });

  it("visitante vê só o botão Login", () => {
    sessao.autenticado = false;
    renderMenu();
    expect(screen.getByRole("button", { name: "Login" })).toBeInTheDocument();
    expect(screen.queryByTestId("avatar-iniciais")).not.toBeInTheDocument();
  });

  it("não tem violação de acessibilidade", async () => {
    const { container } = renderMenu(true);
    expect(await axe(container)).toHaveNoViolations();
  });
});
