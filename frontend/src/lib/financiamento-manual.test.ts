import { describe, expect, it } from "vitest";
import type { InstrumentoEquipamento } from "@/services/monitoramento-instrumentos";
import {
  candidatosConciliacao,
  instrumentosManuaisFinanciamento,
} from "./financiamento-manual";

const inst = (nr: string, tipo: string, cnes: string | null) =>
  ({ nr_convenio: nr, tipo_contratacao: tipo, cnes }) as InstrumentoEquipamento;

describe("financiamento manual", () => {
  it("lista só FAF e TED que não correspondem a uma proposta", () => {
    const itens = [
      inst("1", "FAF", null),
      inst("2", "TED", null),
      inst("3", "Convênio", null),
      inst("202500044035", "FAF", null),
    ];
    const r = instrumentosManuaisFinanciamento(itens, [
      { cd_parceria: "202500044035", id_proposta: 44942 },
    ]);
    expect(r.map((i) => i.nr_convenio)).toEqual(["1", "2"]);
  });

  it("candidato exige o mesmo CNES e outro número", () => {
    const itens = [inst("A", "FAF", "0019445"), inst("B", "FAF", "999")];
    expect(candidatosConciliacao(itens, "0019445", "X")).toHaveLength(1);
    expect(candidatosConciliacao(itens, "0019445", "A")).toHaveLength(0);
    expect(candidatosConciliacao(itens, null, "X")).toHaveLength(0);
  });
});
