import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SecaoPropostasCandidatas } from "./secao-propostas-candidatas";

vi.mock("@/hooks/use-propostas-candidatas", () => ({
  usePropostasCandidatas: () => ({
    carregando: false,
    propostas: [
      {
        id: 1,
        id_proposta: 123,
        cnpj_ente_recebedor: "12345678000190",
        nm_proponente: "Hospital de teste",
        municipio: "Brasília",
        uf: "DF",
        ds_objeto: "",
        nm_programa: "Programa de teste",
        id_programa: 1,
        componente_batido: "Componente",
        equipamentos: [],
        equipamento_detectado: null,
        vl_global_proposta: null,
        situacao_proposta: "Em análise",
        data_proposta: null,
        metas_resumo: null,
        cnes: "7654321",
        cnes_nome_estabelecimento: null,
        tem_parceria: false,
        cd_parceria: null,
        created_at: "2026-09-25T00:00:00Z",
      },
    ],
  }),
}));

vi.mock("@/hooks/useInstrumentosMonitorados", () => ({
  useMonitoramentoInstrumentos: () => ({ data: [] }),
}));

vi.mock("./proposta-card", () => ({
  CardProposta: ({ p }: { p: { id_proposta: number } }) => (
    <p>Proposta {p.id_proposta}</p>
  ),
}));

describe("SecaoPropostasCandidatas", () => {
  it("encontra repasse pelo CNES", async () => {
    render(<SecaoPropostasCandidatas modo="tramitacao" />);

    await userEvent.type(
      screen.getByPlaceholderText(
        "Buscar por proponente, município, CNPJ ou CNES...",
      ),
      "7654321",
    );

    expect(screen.getByText("Proposta 123")).toBeVisible();
  });
});
