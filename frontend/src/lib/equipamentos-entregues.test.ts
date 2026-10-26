import { describe, expect, it } from "vitest";
import { entreguesPorFamilia } from "./equipamentos-entregues";

describe("entregues por família", () => {
  it("soma só os instrumentos do recorte", () => {
    const r = entreguesPorFamilia(
      [
        { nr_convenio: "1", familia: "Mamógrafo", planejado: 2, entregue: 1 },
        { nr_convenio: "2", familia: "Mamógrafo", planejado: 3, entregue: 3 },
        { nr_convenio: "3", familia: "Mamógrafo", planejado: 9, entregue: 9 },
        { nr_convenio: "1", familia: "Colposcópio", planejado: 1, entregue: 0 },
      ],
      new Set(["1", "2"]),
    );
    expect(r).toEqual([
      { familia: "Mamógrafo", planejado: 5, entregue: 4 },
      { familia: "Colposcópio", planejado: 1, entregue: 0 },
    ]);
  });
});
