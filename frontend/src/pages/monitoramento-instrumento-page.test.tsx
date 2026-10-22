import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { MonitoramentoInstrumentoPage } from "./monitoramento-instrumento-page";

vi.mock("@/components/features/monitoramento-interno", () => ({
  MonitoramentoInterno: () => <div>Detalhe do instrumento</div>,
}));

function Localizacao() {
  const location = useLocation();
  return <output>{`${location.pathname}${location.search}`}</output>;
}

describe("MonitoramentoInstrumentoPage", () => {
  it("volta para a origem com os filtros preservados", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          "/monitoramento-equipamentos/instrumentos/953749?retorno=%2Fmonitoramento-equipamentos%3Fuf%3DMG%26pagina%3D2",
        ]}
      >
        <Routes>
          <Route
            path="/monitoramento-equipamentos/instrumentos/:nrConvenio"
            element={<MonitoramentoInstrumentoPage />}
          />
          <Route path="/monitoramento-equipamentos" element={<Localizacao />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(
      screen.getByRole("link", {
        name: "Voltar para Instrumentos e repasses",
      }),
    );

    expect(
      screen.getByText("/monitoramento-equipamentos?uf=MG&pagina=2"),
    ).toBeVisible();
  });
});
