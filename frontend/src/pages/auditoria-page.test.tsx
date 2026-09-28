import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuditoriaPage } from "./auditoria-page";

vi.mock("@/hooks/useAuditoria", () => ({ useAuditoria: vi.fn() }));

function Localizacao() {
  return <output>{useLocation().pathname}</output>;
}

describe("AuditoriaPage", () => {
  it("oferece retorno para usuários quando o histórico veio da gestão de usuários", async () => {
    const { useAuditoria } = await import("@/hooks/useAuditoria");
    vi.mocked(useAuditoria).mockReturnValue({
      itens: [],
      total: 0,
      carregando: false,
      erro: null,
      refetch: vi.fn(),
    });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/admin/auditoria?usuario_id=42"]}>
        <Routes>
          <Route path="/admin/auditoria" element={<AuditoriaPage />} />
          <Route path="/admin/usuarios" element={<Localizacao />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(
      screen.getByRole("button", { name: /voltar para usuários/i }),
    );

    expect(screen.getByText("/admin/usuarios")).toBeVisible();
  });
});
