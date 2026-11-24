import { describe, expect, it } from "vitest";
import { legendaPorContagem } from "./relatorio-legendas";

describe("legendaPorContagem", () => {
  it("lista os tipos com contagem, plural e 'e' final", () => {
    const tipos = [
      ...Array(10).fill("Convênio"),
      ...Array(10).fill("PERSUS I"),
      ...Array(5).fill("PERSUS II"),
    ];
    expect(legendaPorContagem(tipos)).toBe(
      "10 CONVÊNIOS, 10 PERSUS I e 5 PERSUS II",
    );
  });
  it("usa singular e ignora vazios", () => {
    expect(legendaPorContagem(["FAF", "TED", "TED", null, ""])).toBe(
      "1 FAF e 2 TEDs",
    );
  });
  it("ordena situações pelo funil e tolera caixa e acento", () => {
    expect(
      legendaPorContagem([
        "Rejeitada",
        "Em Elaboração",
        "em analise",
        "Aprovada",
        "Aprovada",
      ]),
    ).toBe("2 aprovadas, 1 em análise, 1 em elaboração e 1 rejeitada");
  });
  it("sem dados devolve travessão", () => {
    expect(legendaPorContagem([])).toBe("—");
  });
});
