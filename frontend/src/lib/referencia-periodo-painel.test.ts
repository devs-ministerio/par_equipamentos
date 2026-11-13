import { describe, expect, it } from "vitest";
import {
  anosPorReferencia,
  referenciaValida,
} from "@/lib/referencia-periodo-painel";

const dados = [
  { nr_convenio: "A", data: "2026-03-01", realizada: true },
  { nr_convenio: "B", data: "2027-01-15", realizada: false },
  { nr_convenio: "C", data: "2020-05-10", realizada: true },
];

describe("referência do período do Painel", () => {
  it("mantém realizadas e previstas em séries distintas", () => {
    expect([...anosPorReferencia("inauguracao_realizada", dados)]).toEqual([
      ["A", 2026],
      ["C", 2020],
    ]);
    expect([...anosPorReferencia("inauguracao_prevista", dados)]).toEqual([
      ["B", 2027],
    ]);
    expect(anosPorReferencia("ano_instrumento", dados).size).toBe(0);
  });

  it("valor desconhecido volta ao ano do instrumento", () => {
    expect(referenciaValida("qualquer")).toBe("ano_instrumento");
    expect(referenciaValida("inauguracao_prevista")).toBe(
      "inauguracao_prevista",
    );
  });
});
