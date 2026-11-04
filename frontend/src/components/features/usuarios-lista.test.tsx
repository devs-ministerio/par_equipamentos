import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UsuariosLista } from "./usuarios-lista";

const USUARIO = {
  id: 9,
  name: "Rafael Lima",
  email: "rafael.lima@saude.gov.br",
  role: "colaborador" as const,
  status: "inactive" as const,
  created_at: "2026-02-01T12:00:00Z",
  activated_at: null,
};

const PROPS = {
  total: 1,
  page: 1,
  pageSize: 20,
  carregando: false,
  erro: null,
  onPageChange: vi.fn(),
  onGerenciar: vi.fn(),
  onNovoUsuario: vi.fn(),
  onRetry: vi.fn(),
};

describe("UsuariosLista", () => {
  it("reduz as ações da lista a um único ponto de gerenciamento", async () => {
    const user = userEvent.setup();
    const onGerenciar = vi.fn();
    render(
      <UsuariosLista
        {...PROPS}
        usuarios={[USUARIO]}
        onGerenciar={onGerenciar}
      />,
    );

    expect(
      screen.getAllByRole("button", { name: "Gerenciar Rafael Lima" }),
    ).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Editar" }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByText("Gerenciar", { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Ações", { exact: true }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getAllByRole("button", { name: "Gerenciar Rafael Lima" })[0],
    );
    expect(onGerenciar).toHaveBeenCalledWith(USUARIO);
  });

  it.each([
    ["2026-10-27T02:30:00Z", "26/10/2026, 23:30"],
    [null, "Sem registro"],
    [undefined, "Indisponível"],
  ])(
    "mostra último login %s no horário de Brasília",
    (ultimo_login_em, esperado) => {
      // Arrange / Act
      render(
        <UsuariosLista
          {...PROPS}
          usuarios={[{ ...USUARIO, ultimo_login_em }]}
        />,
      );
      // Assert: tabela e card mobile recebem o mesmo dado.
      expect(screen.getAllByText(esperado)).toHaveLength(2);
    },
  );

  it("oferece CTA no estado vazio", () => {
    render(<UsuariosLista {...PROPS} usuarios={[]} total={0} />);

    expect(screen.getByText("Nenhum usuário encontrado")).toBeVisible();
    expect(screen.getByRole("button", { name: /novo usuário/i })).toBeVisible();
  });
});
