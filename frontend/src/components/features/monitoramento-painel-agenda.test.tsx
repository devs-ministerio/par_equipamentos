import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type {
  InauguracaoResumo,
  LicencaVencendoResumo,
} from "@/services/monitoramento-resumo";
import { AgendaExecutiva } from "./monitoramento-painel-agenda";

function licencas(prefixo = "QA-L"): LicencaVencendoResumo[] {
  return Array.from({ length: 9 }, (_, i) => ({
    nr_convenio: `${prefixo}${i}`,
    nome_convenente: `Unidade ${prefixo}${i}`,
    data_validade: "2026-11-01",
    dias: i,
  }));
}
const inauguracao: InauguracaoResumo = {
  nr_convenio: "QA-I",
  nome_convenente: "Unidade inauguração",
  municipio: null,
  uf: null,
  equipamento: null,
  data: "2026-10-20",
  realizada: false,
  dias: 0,
};

describe("Agenda executiva e atualização do recorte", () => {
  it("retorna à primeira página quando os instrumentos mudam, mesmo com o mesmo total", async () => {
    // Given
    const { rerender } = render(
      <MemoryRouter>
        <AgendaExecutiva licencas={licencas()} inauguracoes={[]} />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Próxima página" }));
    expect(screen.getByText("Unidade QA-L8")).toBeInTheDocument();
    // When
    rerender(
      <MemoryRouter>
        <AgendaExecutiva licencas={licencas("QA-N")} inauguracoes={[]} />
      </MemoryRouter>,
    );
    // Then
    expect(screen.getByText("Página 1 de 2")).toBeInTheDocument();
    expect(screen.getByText("Unidade QA-N0")).toBeInTheDocument();
    expect(screen.queryByText("Unidade QA-L8")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Página anterior" }),
    ).toBeDisabled();
  });

  it("reordena e reinicia a paginação quando o prazo muda sem trocar o instrumento", async () => {
    // Given
    const lista = licencas();
    const { rerender } = render(
      <MemoryRouter>
        <AgendaExecutiva licencas={lista} inauguracoes={[]} />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Próxima página" }));
    // When
    rerender(
      <MemoryRouter>
        <AgendaExecutiva
          licencas={lista.map((item, i) =>
            i === 8 ? { ...item, dias: -10 } : item,
          )}
          inauguracoes={[]}
        />
      </MemoryRouter>,
    );
    // Then
    expect(screen.getByText("Página 1 de 2")).toBeInTheDocument();
    expect(screen.getAllByRole("link")[0]).toHaveTextContent("Unidade QA-L8");
    expect(screen.getByText("Vencida há 10 dias")).toBeInTheDocument();
  });

  it("não inclui inaugurações realizadas e explicita a agenda sem pendências", () => {
    // Given / When
    render(
      <MemoryRouter>
        <AgendaExecutiva
          licencas={[]}
          inauguracoes={[{ ...inauguracao, realizada: true }]}
        />
      </MemoryRouter>,
    );
    // Then
    expect(
      screen.getByText("Nenhum prazo crítico registrado."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("desempata prazos de forma estável e preserva a origem dos links", () => {
    // Given
    const origem = "/monitoramento-equipamentos/painel?uf=GO#prazos";
    const lista = [licencas()[0]!, { ...licencas()[1]!, dias: 0 }];
    const { rerender } = render(
      <MemoryRouter initialEntries={[origem]}>
        <AgendaExecutiva licencas={lista} inauguracoes={[inauguracao]} />
      </MemoryRouter>,
    );
    const antes = screen.getAllByRole("link").map((link) => link.textContent);
    // When
    rerender(
      <MemoryRouter initialEntries={[origem]}>
        <AgendaExecutiva
          licencas={[...lista].reverse()}
          inauguracoes={[inauguracao]}
        />
      </MemoryRouter>,
    );
    // Then
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(
      antes,
    );
    for (const link of screen.getAllByRole("link"))
      expect(
        new URL(
          link.getAttribute("href")!,
          "http://sigeo.local",
        ).searchParams.get("retorno"),
      ).toBe(origem);
    expect(screen.getByText("Em 0 dias")).toBeInTheDocument();
  });

  it("encolhe a lista sem página vazia ou navegação obsoleta", async () => {
    // Given
    const { rerender } = render(
      <MemoryRouter>
        <AgendaExecutiva licencas={licencas()} inauguracoes={[]} />
      </MemoryRouter>,
    );
    await userEvent.setup().click(
      within(screen.getByRole("navigation")).getByRole("button", {
        name: "Próxima página",
      }),
    );
    // When
    rerender(
      <MemoryRouter>
        <AgendaExecutiva licencas={[licencas()[0]!]} inauguracoes={[]} />
      </MemoryRouter>,
    );
    // Then
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <AgendaExecutiva licencas={[]} inauguracoes={[]} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.getByText("Nenhum prazo crítico registrado."),
    ).toBeInTheDocument();
  });
});
