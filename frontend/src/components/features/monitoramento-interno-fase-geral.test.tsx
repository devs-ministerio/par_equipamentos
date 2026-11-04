import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { criarMarcosInteracao } from "@/test-fixtures/monitoramento-interacoes";
import { MonitoramentoInternoFaseGeral } from "./monitoramento-interno-fase-geral";

afterEach(cleanup);

describe("indicador da fase geral", () => {
  it.each([false, true])(
    "representa a conclusão como feita: %s",
    (concluido) => {
      // Arrange
      const fases = criarMarcosInteracao().filter(
        (m) => m.grupo === "fase_geral",
      );
      const faseAtual = fases[concluido ? 1 : 0];
      // Act
      render(
        <MonitoramentoInternoFaseGeral
          fasesGerais={fases}
          faseAtual={faseAtual}
          pctAtual={concluido ? 1 : 0.5}
        />,
      );
      // Assert
      const atual = screen
        .getAllByRole("listitem")
        .find((li) => li.getAttribute("aria-current") === "step")!;
      const indicador = atual.querySelector(".rounded-full")!;
      expect(indicador).toHaveTextContent(concluido ? "✓" : "");
      expect(indicador).toHaveClass(concluido ? "bg-success" : "bg-primary");
      if (concluido) expect(indicador).not.toHaveClass("bg-primary");
    },
  );
});
