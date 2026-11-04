import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { LoginPage } from "./login-page";

vi.mock("@/hooks/useAuthSession", () => ({
  useAuthSession: () => ({
    autenticado: true,
    login: vi.fn(),
    erroLogin: null,
  }),
}));

function Destino() {
  const l = useLocation();
  return (
    <output aria-label="destino">{`${l.pathname}${l.search}${l.hash}`}</output>
  );
}

function montar(
  entrada: string | { pathname: string; search?: string; state?: unknown },
) {
  render(
    <MemoryRouter initialEntries={[entrada]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Destino />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LoginPage: retorno após autenticar", () => {
  it("volta à página, filtros e fragmento do state", () => {
    montar({
      pathname: "/login",
      state: { from: "/monitoramento-equipamentos/painel?uf=SC#mapa" },
    });
    expect(screen.getByLabelText("destino").textContent).toBe(
      "/monitoramento-equipamentos/painel?uf=SC#mapa",
    );
  });

  it("aceita o retorno da query string deixado pelo cliente HTTP", () => {
    montar(
      `/login?retorno=${encodeURIComponent("/monitoramento-equipamentos/painel?uf=SC")}`,
    );
    expect(screen.getByLabelText("destino").textContent).toBe(
      "/monitoramento-equipamentos/painel?uf=SC",
    );
  });

  it.each(["https://outro.site/x", "//outro.site", "/login"])(
    "recusa destino não permitido %s e usa o padrão",
    (ruim) => {
      montar(`/login?retorno=${encodeURIComponent(ruim)}`);
      expect(screen.getByLabelText("destino").textContent).toBe(
        "/monitoramento-equipamentos",
      );
    },
  );
});
