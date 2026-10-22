import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { DivergenciaConclusao } from "@/services/monitoramento-resumo";
import { DivergenciasConclusao } from "./monitoramento-painel-divergencias";

const origem =
  "/monitoramento-equipamentos/painel?uf=GO&municipio=anapolis&pagina=3#prazos";
function lista(prefixo = "QA"): DivergenciaConclusao[] {
  return Array.from({ length: 9 }, (_, i) => ({
    nr_convenio: `${prefixo}${i}`,
    nome_convenente: `Unidade ${prefixo}${i}`,
    tipo_contratacao: "Convênio",
    fase_interna: "Concluído",
    fonte_externa: "SICONV",
    status_externo_original: "Prestação de Contas enviada para Análise",
    status_externo_normalizado: "em_analise",
    atualizado_em: "2026-10-20T10:00:00Z",
    risco: "Conclusão externa pendente",
  }));
}
function Tela({ itens }: { itens: DivergenciaConclusao[] }) {
  return (
    <MemoryRouter initialEntries={[origem]}>
      <DivergenciasConclusao itens={itens} />
    </MemoryRouter>
  );
}

describe("Divergências do painel com paginação e fonte original", () => {
  it("recomeça no primeiro caso quando o recorte muda com o mesmo total", async () => {
    // Given
    const { rerender } = render(<Tela itens={lista()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Próxima página" }));
    expect(screen.getByText("Unidade QA8")).toBeInTheDocument();
    // When
    rerender(<Tela itens={lista("QB")} />);
    // Then
    expect(screen.getByText("Página 1 de 2")).toBeInTheDocument();
    expect(screen.getByText("Unidade QB0")).toBeInTheDocument();
    expect(screen.queryByText("Unidade QA8")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Página anterior" }),
    ).toBeDisabled();
  });

  it("atualiza a situação original sem traduzir a fonte nem perder a página atual", async () => {
    // Given
    const itens = lista();
    const { rerender } = render(<Tela itens={itens} />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Próxima página" }));
    // When
    rerender(
      <Tela
        itens={itens.map((item, i) =>
          i === 8
            ? {
                ...item,
                tipo_contratacao: null,
                status_externo_original: "Em execução — texto exato da fonte",
                atualizado_em: "2026-10-20T11:00:00Z",
              }
            : item,
        )}
      />,
    );
    // Then
    expect(screen.getByText("Página 2 de 2")).toBeInTheDocument();
    expect(
      screen.getByText("Em execução — texto exato da fonte"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Prestação de Contas enviada para Análise"),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Fonte não informada/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Unidade QA8/ });
    expect(
      new URL(
        link.getAttribute("href")!,
        "http://sigeo.local",
      ).searchParams.get("retorno"),
    ).toBe(origem);
  });

  it("remove paginação e casos antigos quando a lista encolhe ou esvazia", async () => {
    // Given
    const { rerender } = render(<Tela itens={lista()} />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Próxima página" }));
    // When
    rerender(<Tela itens={[lista()[0]!]} />);
    // Then
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("Unidade QA0")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    rerender(<Tela itens={[]} />);
    expect(
      screen.getByText("Nenhuma divergência de conclusão registrada."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("permite percorrer todas as páginas sem alterar os registros recebidos", async () => {
    // Given
    const itens = lista();
    const original = structuredClone(itens);
    render(<Tela itens={itens} />);
    const user = userEvent.setup();
    const antes = screen.getAllByRole("link").map((link) => link.textContent);
    // When
    await user.click(screen.getByRole("button", { name: "Próxima página" }));
    const depois = screen.getAllByRole("link").map((link) => link.textContent);
    await user.click(screen.getByRole("button", { name: "Página anterior" }));
    // Then
    expect(new Set([...antes, ...depois]).size).toBe(9);
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(
      antes,
    );
    expect(itens).toEqual(original);
  });
});
