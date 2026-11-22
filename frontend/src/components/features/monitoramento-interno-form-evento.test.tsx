/** Plan Mode monitoramento-evolucao 2026-09-19 (Bloco 3) -- fecha o bug
 * corrigido no backend (evento de cronograma físico/regulatório sem
 * vínculo de fase geral): o form precisa exigir e enviar `faseGeralId`
 * pra marco fora do grupo fase_geral, e nunca exigir pra marco que já É
 * de fase_geral. */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { MarcoCatalogo } from "@/services/monitoramento-marcos";
import { MonitoramentoInternoFormEvento } from "./monitoramento-interno-form-evento";

const MARCOS: MarcoCatalogo[] = [
  {
    id: 1,
    codigo: "fase_em_licitacao",
    grupo: "fase_geral",
    ordem: 1,
    execucao_fisica_pct_referencia: 0.1,
    rotulo: "Em licitação",
    descricao_referencia: null,
  },
  {
    id: 2,
    codigo: "fase_contratado",
    grupo: "fase_geral",
    ordem: 4,
    execucao_fisica_pct_referencia: 0.5,
    rotulo: "Contratado",
    descricao_referencia: null,
  },
  {
    id: 3,
    codigo: "fase_concluido",
    grupo: "fase_geral",
    ordem: 8,
    execucao_fisica_pct_referencia: 1,
    rotulo: "Concluído",
    descricao_referencia: null,
  },
  {
    id: 12,
    codigo: "cronograma_entrega",
    grupo: "cronograma_fisico",
    ordem: null,
    execucao_fisica_pct_referencia: null,
    rotulo: "Entrega no estabelecimento",
    descricao_referencia: null,
  },
  {
    id: 13,
    codigo: "cronograma_instalacao_inicio",
    grupo: "cronograma_fisico",
    ordem: null,
    execucao_fisica_pct_referencia: null,
    rotulo: "Instalação — início",
    descricao_referencia: null,
  },
];

describe("MonitoramentoInternoFormEvento", () => {
  it("não oferece a entrega no estabelecimento (lançada em Equipamentos do instrumento)", () => {
    render(
      <MonitoramentoInternoFormEvento marcos={MARCOS} onRegistrar={vi.fn()} />,
    );
    const select = screen.getByLabelText("Marco");
    expect(
      within(select).queryByRole("option", {
        name: "Entrega no estabelecimento",
      }),
    ).not.toBeInTheDocument();
  });

  it("em modo de correção mostra o marco fixo (não editável) e rótulo customizado", () => {
    render(
      <MonitoramentoInternoFormEvento
        marcos={MARCOS}
        marcoFixo={
          MARCOS.find((marco) => marco.codigo === "cronograma_entrega")!
        }
        rotuloSubmit="Salvar correção"
        onRegistrar={vi.fn()}
      />,
    );

    expect(screen.getByText("Entrega no estabelecimento")).toBeInTheDocument();
    expect(screen.queryByLabelText("Marco")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Salvar correção" }),
    ).toBeInTheDocument();
  });
});
