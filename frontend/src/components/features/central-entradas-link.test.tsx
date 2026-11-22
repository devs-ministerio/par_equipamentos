import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  prepararHooksRadar,
  limparHooksRadar,
} from "@/test-fixtures/radar-hooks";
import { CentralEntradasLink } from "./central-entradas-link";

afterEach(limparHooksRadar);

describe("botão do Radar de instrumentos", () => {
  it.each(["admin", "gestor"] as const)("aparece para %s", async (role) => {
    const api = prepararHooksRadar(role);
    render(<CentralEntradasLink />, { wrapper: api.wrapper });
    expect(
      await screen.findByRole("button", { name: /Radar de instrumentos/ }),
    ).toBeVisible();
  });

  it.each(["colaborador", "leitor"] as const)(
    "não aparece para %s",
    async (role) => {
      const api = prepararHooksRadar(role);
      render(<CentralEntradasLink />, { wrapper: api.wrapper });
      await new Promise((r) => setTimeout(r, 50));
      expect(
        screen.queryByRole("button", { name: /Radar de instrumentos/ }),
      ).not.toBeInTheDocument();
    },
  );
});
