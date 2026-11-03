import { describe, expect, it } from "vitest";
import { rotulosEquipamentoDoInstrumento } from "./monitoramento-filtro-equipamentos";

describe("rotulosEquipamentoDoInstrumento", () => {
  it("devolve um rótulo por equipamento distinto", () => {
    expect(
      rotulosEquipamentoDoInstrumento([
        { nome: "Mamógrafo" },
        { nome: "mamógrafo" },
        { nome: "Ultrassom" },
      ]),
    ).toHaveLength(2);
  });

  it("sem marcador não inventa classificação", () => {
    expect(rotulosEquipamentoDoInstrumento([])).toEqual([]);
    expect(rotulosEquipamentoDoInstrumento(undefined)).toEqual([]);
  });
});
