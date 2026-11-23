import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ComponentProps } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MonitoramentoFilaAcoes } from "./monitoramento-fila-acoes";

type Props = ComponentProps<typeof MonitoramentoFilaAcoes>;
const origem =
  "/monitoramento-equipamentos/painel?uf=GO&municipio=anapolis#prazos";
function propsFila(extra: Partial<Props> = {}): Props {
  return { acoesPendentes: 0, acoes: [], filaTruncada: false, ...extra };
}
function filaSintetica(prefixo = "QA", deslocamento = 0): Props["acoes"] {
  return Array.from({ length: 9 }, (_, i) => ({
    id: deslocamento + i + 1,
    nr_convenio: `${prefixo}${i}`,
    nome_convenente: `Unidade ${prefixo}${i}`,
    descricao: `Conferência ${prefixo}${i}`,
    data_prevista: null,
    responsavel: null,
    dias: null,
  }));
}
function TelaFila({ dados }: { dados: Props }) {
  return (
    <MemoryRouter initialEntries={[origem]}>
      <MonitoramentoFilaAcoes {...dados} />
    </MemoryRouter>
  );
}
function secaoFila() {
  return within(
    screen.getByRole("heading", { name: "Fila de ações" }).closest("section")!,
  );
}

describe("MonitoramentoFilaAcoes", () => {
  it.each([0, 1])(
    "não avisa truncamento global quando as %s ações do recorte estão todas carregadas",
    (quantidade) => {
      // Given: a fonte global foi limitada, mas este recorte está completo.
      const acoes = filaSintetica().slice(0, quantidade);
      // When
      render(
        <TelaFila
          dados={propsFila({
            acoes,
            acoesPendentes: quantidade,
            filaTruncada: true,
          })}
        />,
      );
      // Then
      expect(secaoFila().queryByText(/primeiras 500/)).not.toBeInTheDocument();
      expect(secaoFila().queryAllByRole("link").length).toBe(quantidade);
    },
  );

  it("não afirma ausência de ações quando o recorte tem pendências fora da lista truncada", () => {
    // Given / When: total agregado conhece ações não presentes nas primeiras 500.
    render(
      <TelaFila dados={propsFila({ acoesPendentes: 3, filaTruncada: true })} />,
    );
    // Then
    expect(
      secaoFila().queryByText("Nenhuma ação pendente neste recorte."),
    ).not.toBeInTheDocument();
    expect(
      secaoFila().getByText(
        /Há ações pendentes neste recorte que não estão na lista carregada/,
      ),
    ).toBeInTheDocument();
    expect(secaoFila().queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("reinicia a fila ao trocar instrumentos com a mesma quantidade de ações", async () => {
    // Given
    const { rerender } = render(
      <TelaFila
        dados={propsFila({ acoes: filaSintetica(), acoesPendentes: 9 })}
      />,
    );
    const user = userEvent.setup();
    await user.click(
      secaoFila().getByRole("button", { name: "Próxima página" }),
    );
    expect(secaoFila().getByText("Conferência QA8")).toBeInTheDocument();
    // When
    rerender(
      <TelaFila
        dados={propsFila({
          acoes: filaSintetica("QB", 100),
          acoesPendentes: 9,
        })}
      />,
    );
    // Then
    expect(secaoFila().getByText("Página 1 de 2")).toBeInTheDocument();
    expect(secaoFila().getByText("Conferência QB0")).toBeInTheDocument();
    expect(secaoFila().queryByText("Conferência QA8")).not.toBeInTheDocument();
  });

  it("encolhe e esvazia a fila sem manter página ou aviso antigo", async () => {
    // Given
    const lista = filaSintetica();
    const { rerender } = render(
      <TelaFila
        dados={propsFila({
          acoes: lista,
          acoesPendentes: 20,
          filaTruncada: true,
        })}
      />,
    );
    await userEvent
      .setup()
      .click(secaoFila().getByRole("button", { name: "Próxima página" }));
    // When
    rerender(
      <TelaFila dados={propsFila({ acoes: [lista[0]!], acoesPendentes: 1 })} />,
    );
    // Then
    expect(secaoFila().getByText("Página 1 de 1")).toBeInTheDocument();
    expect(secaoFila().queryByText(/primeiras 500/)).not.toBeInTheDocument();
    expect(
      secaoFila().getByRole("button", { name: "Próxima página" }),
    ).toBeDisabled();
    rerender(<TelaFila dados={propsFila()} />);
    expect(
      secaoFila().getByText("Nenhuma ação pendente neste recorte."),
    ).toBeInTheDocument();
    expect(secaoFila().queryByRole("link")).not.toBeInTheDocument();
    expect(secaoFila().queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("distingue prazo ausente/atrasado/hoje/futuro e mantém o retorno de cada link", () => {
    // Given
    const lista = filaSintetica()
      .slice(0, 4)
      .map((acao, i) => ({
        ...acao,
        dias: [null, -2, 0, 3][i]!,
        responsavel: i === 3 ? "Técnico sintético" : null,
      }));
    // When
    render(<TelaFila dados={propsFila({ acoes: lista, acoesPendentes: 4 })} />);
    // Then
    for (const texto of [
      "Sem prazo",
      "2 dias de atraso",
      "Vence hoje",
      "Em 3 dias",
    ])
      expect(secaoFila().getByText(texto)).toBeInTheDocument();
    expect(secaoFila().getAllByText(/Responsável não definido/)).toHaveLength(
      3,
    );
    expect(secaoFila().getByText(/Técnico sintético/)).toBeInTheDocument();
    for (const link of secaoFila().getAllByRole("link"))
      expect(
        new URL(
          link.getAttribute("href")!,
          "http://sigeo.local",
        ).searchParams.get("retorno"),
      ).toBe(origem);
  });
});
