import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { PageHeader } from "./page-header";

describe("PageHeader", () => {
  it("mostra eyebrow, título e descrição", () => {
    render(
      <PageHeader
        eyebrow="Análise de mérito"
        title="Parâmetros de Necessidade"
        description="Descrição da página."
      />,
    );
    expect(screen.getByText("Análise de mérito")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Parâmetros de Necessidade" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Descrição da página.")).toBeInTheDocument();
  });

  it("mostra breadcrumb e actions quando fornecidos", () => {
    render(
      <PageHeader
        breadcrumb={<span>Convênio 904824 &gt; Detalhe</span>}
        eyebrow="Monitoramento interno"
        title="Convênio 904824"
        actions={<button type="button">Ação</button>}
      />,
    );
    expect(screen.getByText("Convênio 904824 > Detalhe")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ação" })).toBeInTheDocument();
  });

  it("não tem violação de acessibilidade", async () => {
    const { container } = render(
      <PageHeader eyebrow="Eyebrow" title="Título" description="Descrição" />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
