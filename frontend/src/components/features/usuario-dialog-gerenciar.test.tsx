import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { UsuarioDialogGerenciar } from "./usuario-dialog-gerenciar";

const USUARIO = {
  id: 42,
  name: "Marina Souza",
  email: "marina.souza@saude.gov.br",
  role: "gestor" as const,
  status: "active" as const,
  created_at: "2026-01-20T12:00:00Z",
  activated_at: "2026-01-21T12:00:00Z",
};

function renderizar() {
  const props = {
    usuario: USUARIO,
    onOpenChange: vi.fn(),
    onEditar: vi.fn(),
    onRedefinirSenha: vi.fn(),
    onAlterarStatus: vi.fn(),
    onVerHistorico: vi.fn(),
  };
  return { props, ...render(<UsuarioDialogGerenciar {...props} />) };
}

describe("UsuarioDialogGerenciar", () => {
  it("concentra os dados e as ações administrativas em um único diálogo", () => {
    renderizar();

    expect(screen.getByRole("heading", { name: "Marina Souza" })).toBeVisible();
    expect(screen.getByText("Gestor")).toBeVisible();
    expect(screen.getByText("Ativo")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /editar dados e perfil/i }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /inativar acesso/i }),
    ).toBeVisible();
  });

  it("encaminha a ação escolhida com o usuário correto", async () => {
    const user = userEvent.setup();
    const { props } = renderizar();

    await user.click(
      screen.getByRole("button", { name: /enviar redefinição/i }),
    );

    expect(props.onRedefinirSenha).toHaveBeenCalledWith(USUARIO);
  });

  it("não apresenta violações básicas de acessibilidade", async () => {
    const { baseElement } = renderizar();

    expect(await axe(baseElement)).toHaveNoViolations();
  });
});
