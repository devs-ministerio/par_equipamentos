import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SingleSelectFilter } from "./single-select-filter";

describe("SingleSelectFilter", () => {
  it("mostra a opção selecionada pelo rótulo", () => {
    render(
      <SingleSelectFilter
        placeholder="UF"
        options={[{ value: "SC", label: "Santa Catarina" }]}
        value="SC"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("button").textContent).toContain("Santa Catarina");
  });

  it("mantém visível o filtro ativo que saiu das opções", () => {
    render(
      <SingleSelectFilter
        placeholder="UF"
        options={[]}
        value="SC"
        onChange={() => {}}
      />,
    );
    const texto = screen.getByRole("button").textContent ?? "";
    expect(texto).toContain("SC");
    expect(texto).toContain("sem correspondência");
  });

  it("usa o placeholder sem valor", () => {
    render(
      <SingleSelectFilter
        placeholder="UF"
        options={[]}
        value={null}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("button").textContent).toContain("UF");
  });
});
