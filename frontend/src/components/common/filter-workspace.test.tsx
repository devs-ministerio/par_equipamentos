import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { FilterWorkspace } from "./filter-workspace";

describe("FilterWorkspace", () => {
  it("expõe a ação semântica de limpar quando há filtros ativos", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <FilterWorkspace
        hasAnyFilter
        onClear={onClear}
        contagem="2 de 10 resultados"
      >
        <button type="button">Filtro de teste</button>
      </FilterWorkspace>,
    );

    await user.click(screen.getByRole("button", { name: /limpar filtros/i }));

    expect(onClear).toHaveBeenCalledOnce();
    expect(screen.getByText("2 de 10 resultados")).toBeInTheDocument();
  });

  it("não introduz violações axe", async () => {
    const { container } = render(
      <FilterWorkspace hasAnyFilter onClear={vi.fn()}>
        <button type="button">Filtro de teste</button>
      </FilterWorkspace>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
