import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LicencaOperacaoCard } from "./licenca-operacao-card";

function montar(corpo: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(corpo), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <LicencaOperacaoCard numeroConvenio="1" />
    </QueryClientProvider>,
  );
}

const base = {
  exige: true,
  cnes: "2077477",
  sem_cnes: false,
  areas_exigidas: ["RADIOTERAPIA"],
  areas_sem_vinculo: [],
  ultima_carga: "2026-11-19",
};
const vinculo = {
  matricula: "16221",
  designacao: "HOSPITAL ESTADUAL DE BAURU",
  cidade: "BAURU",
  uf: "SP",
  area: "RADIOTERAPIA",
  situacao: "valida",
  validade: "2027-02-17",
  dias: 90,
};

describe("card Licença de operação", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("não aparece quando o instrumento não exige licença", async () => {
    const { container } = montar({
      ...base,
      exige: false,
      areas_exigidas: [],
      vinculos: [],
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it("mostra matrícula, área e validade oficial", async () => {
    montar({ ...base, vinculos: [vinculo] });
    expect(await screen.findByText("Matrícula 16221")).toBeInTheDocument();
    expect(screen.getByText(/Válida até/)).toBeInTheDocument();
    expect(screen.getByText(/HOSPITAL ESTADUAL DE BAURU/)).toBeInTheDocument();
  });

  it("suspensa e ausente da carga não viram vencidas", async () => {
    montar({
      ...base,
      vinculos: [
        { ...vinculo, situacao: "suspensa", validade: null, dias: null },
        {
          ...vinculo,
          matricula: "16902",
          situacao: "nao_consta",
          validade: null,
          dias: null,
        },
      ],
    });
    expect(await screen.findByText("Suspensa")).toBeInTheDocument();
    expect(
      screen.getByText("Não consta na última carga da ANSN"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Vencida/)).toBeNull();
  });

  it("área exigida sem vínculo e instrumento sem CNES", async () => {
    const a = montar({
      ...base,
      areas_sem_vinculo: ["RADIOTERAPIA"],
      vinculos: [],
    });
    expect(
      await screen.findByText("RADIOTERAPIA: sem vínculo com a ANSN"),
    ).toBeInTheDocument();
    a.unmount();
    montar({ ...base, cnes: null, sem_cnes: true, vinculos: [] });
    expect(
      await screen.findByText("Sem CNES vinculado ao instrumento."),
    ).toBeInTheDocument();
  });
});
