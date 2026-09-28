import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { AuditoriaDialogDetalhes } from "./auditoria-dialog-detalhes";

const ITEM = {
  id: 18,
  created_at: "2026-09-28T12:00:00Z",
  usuario_id: 3,
  usuario_nome: "Amanda Chaves",
  usuario_email: "amanda.chaves@saude.gov.br",
  entity_name: "user",
  entity_id: 3,
  action: "atualizar_usuario",
  details: { changes: { role: "gestor" }, origem: "admin" },
};

describe("AuditoriaDialogDetalhes", () => {
  it("apresenta o payload completo sem expandir a tabela", () => {
    render(<AuditoriaDialogDetalhes item={ITEM} onOpenChange={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Detalhes da ação" }),
    ).toBeVisible();
    expect(screen.getByText("Amanda Chaves")).toBeVisible();
    expect(screen.getByText("changes")).toBeVisible();
    expect(screen.getByText(/"gestor"/)).toBeVisible();
  });

  it("não apresenta violações básicas de acessibilidade", async () => {
    const { baseElement } = render(
      <AuditoriaDialogDetalhes item={ITEM} onOpenChange={vi.fn()} />,
    );

    expect(await axe(baseElement)).toHaveNoViolations();
  });
});
