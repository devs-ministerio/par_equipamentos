import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ComponentProps } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MonitoramentoPainelPendencias } from "./monitoramento-painel-pendencias";

type Props = ComponentProps<typeof MonitoramentoPainelPendencias>;
const origem =
  "/monitoramento-equipamentos/painel?uf=GO&municipio=anapolis#prazos";
function propsFila(extra: Partial<Props> = {}): Props {
  return {
    vigencias: [],
    licencas: [],
    inauguracoes: [],
    divergencias: [],
    divergenciasPorFonte: "",
    semTecnico: 0,
    acoesAtrasadas: 0,
    acoesPendentes: 0,
    licencasCnenDeferidas: { quantidade: 0, total: 0 },
    acoes: [],
    filaTruncada: false,
    ...extra,
  };
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
      <MonitoramentoPainelPendencias {...dados} />
    </MemoryRouter>
  );
}
function secaoFila() {
  return within(
    screen.getByRole("heading", { name: "Fila de ações" }).closest("section")!,
  );
}

const licencas = [
  {
    nr_convenio: "123",
    nome_convenente: "Hospital Alfa",
    data_validade: "2026-09-20",
    dias: -9,
  },
  {
    nr_convenio: "456",
    nome_convenente: "Hospital Beta",
    data_validade: "2026-11-20",
    dias: 52,
  },
];

const inauguracoes = [
  {
    nr_convenio: "789",
    nome_convenente: "Hospital Gama",
    municipio: null,
    uf: null,
    equipamento: null,
    data: "2026-09-25",
    realizada: false,
    dias: -4,
  },
];

function renderPendencias(filtrado = false) {
  return render(
    <MemoryRouter>
      <MonitoramentoPainelPendencias
        vigencias={[
          {
            nr_convenio: "123",
            nome_convenente: "Hospital Alfa",
            data_final: "2026-11-10",
            dias: 42,
          },
        ]}
        licencas={licencas}
        inauguracoes={inauguracoes}
        divergencias={[]}
        divergenciasPorFonte=""
        semTecnico={1}
        acoesAtrasadas={filtrado ? 1 : 3}
        acoesPendentes={filtrado ? 2 : 5}
        licencasCnenDeferidas={
          filtrado ? { quantidade: 1, total: 4 } : { quantidade: 2, total: 8 }
        }
        acoes={[]}
        filaTruncada={false}
      />
    </MemoryRouter>,
  );
}

describe("MonitoramentoPainelPendencias", () => {
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

  it("resume os alertas e ordena a agenda pelo prazo mais antigo", () => {
    renderPendencias();

    const resumo = screen.getByLabelText("Resumo das pendências");
    expect(
      within(resumo).getByText("Licenças em menos de 90 dias"),
    ).toBeVisible();
    expect(within(resumo).getByText("Inaugurações atrasadas")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", {
        name: /Instrumentos com vigência a encerrar/,
      }),
    );
    expect(
      within(screen.getByRole("dialog")).getByRole("link", {
        name: /Hospital Alfa/,
      }),
    ).toBeVisible();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }),
    );
    expect(screen.getByText("Vencida há 9 dias")).toBeVisible();
    expect(screen.getByText("Atrasada há 4 dias")).toBeVisible();
    expect(screen.getByText("2/8")).toBeVisible();

    const agenda = screen.getByRole("heading", { name: "Agenda de prazos" })
      .parentElement?.parentElement;
    expect(agenda).toBeTruthy();
    const links = within(agenda!).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringContaining("Hospital Alfa"),
      expect.stringContaining("Hospital Gama"),
      expect.stringContaining("Hospital Beta"),
    ]);
  });

  it("pagina todas as listas operacionais sem perder registros", () => {
    render(
      <MemoryRouter>
        <MonitoramentoPainelPendencias
          vigencias={[]}
          licencas={Array.from({ length: 9 }, (_, i) => ({
            ...licencas[0],
            nr_convenio: `L${i}`,
            nome_convenente: `Licença ${i}`,
            dias: i,
          }))}
          inauguracoes={[]}
          divergencias={Array.from({ length: 9 }, (_, i) => ({
            nr_convenio: `D${i}`,
            nome_convenente: `Divergência ${i}`,
            tipo_contratacao: "Convênio",
            fase_interna: "Concluído",
            fonte_externa: "TransfereGov",
            risco: "Divergência",
            status_externo_original: "Aberto",
            status_externo_normalizado: "aberto",
            atualizado_em: "2026-09-29",
          }))}
          divergenciasPorFonte=""
          semTecnico={0}
          acoesAtrasadas={0}
          acoesPendentes={9}
          licencasCnenDeferidas={{ quantidade: 0, total: 0 }}
          acoes={Array.from({ length: 9 }, (_, i) => ({
            id: i + 1,
            nr_convenio: `A${i}`,
            nome_convenente: `Hospital ${i}`,
            descricao: `Ação ${i}`,
            data_prevista: null,
            responsavel: null,
            dias: i,
          }))}
          filaTruncada={false}
        />
      </MemoryRouter>,
    );
    const agenda = screen.getByRole("navigation", {
      name: "Paginação da agenda de prazos",
    });
    const divergencias = screen.getByRole("navigation", {
      name: "Paginação de divergências",
    });
    const acoes = screen.getByRole("navigation", {
      name: "Paginação da fila de ações",
    });
    fireEvent.click(within(agenda).getByRole("button", { name: /Próxima/ }));
    fireEvent.click(
      within(divergencias).getByRole("button", { name: /Próxima/ }),
    );
    fireEvent.click(within(acoes).getByRole("button", { name: /Próxima/ }));
    expect(screen.getByText("Licença 8")).toBeVisible();
    expect(screen.getByText("Divergência 8")).toBeVisible();
    expect(screen.getByText("Ação 8")).toBeVisible();
  });

  it("apresenta as métricas próprias do recorte filtrado", () => {
    renderPendencias(true);

    expect(screen.getByText("1/4")).toBeVisible();
    expect(screen.queryByText("2/8")).not.toBeInTheDocument();
  });
});
