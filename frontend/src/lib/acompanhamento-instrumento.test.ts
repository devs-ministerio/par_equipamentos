import { describe, expect, it } from "vitest";
import { rotuloInauguracao } from "@/lib/acompanhamento-instrumento";

const base = {
  inauguracao_data: null,
  inauguracao_realizada: false,
  entrega_data: null,
  conferencia: null,
};

describe("rotuloInauguracao", () => {
  it("distingue data real, previsão e ausência", () => {
    expect(rotuloInauguracao(null)).toBe("Sem data de inauguração");
    expect(rotuloInauguracao(base)).toBe("Sem data de inauguração");
    expect(
      rotuloInauguracao({
        ...base,
        inauguracao_data: "2022-03-17",
        inauguracao_realizada: true,
      }),
    ).toContain("Inaugurado em");
    expect(
      rotuloInauguracao({ ...base, inauguracao_data: "2027-01-01" }),
    ).toContain("Inauguração prevista para");
  });
});
