import { describe, expect, it } from "vitest";
import { criarConvenioTeste } from "@/test-fixtures/dados-oficiais";
import { criarPropostaPrevia } from "@/test-fixtures/relatorios-previa";
import { montarRecorte, opcoesContratacao } from "./relatorio-recorte";

const proposta = (cd: string | null, tipo = "FAF") =>
  criarPropostaPrevia(1, { cd_parceria: cd, tipo_contratacao: tipo });

describe("montarRecorte", () => {
  const convenios = [
    criarConvenioTeste({ numero: "1", tipoContratacao: "Convênio" }),
    criarConvenioTeste({ numero: "2", tipoContratacao: "PERSUS I" }),
    criarConvenioTeste({ numero: "3", tipoContratacao: "FAF" }),
    criarConvenioTeste({ numero: "4", tipoContratacao: "TED" }),
  ];

  it("separa instrumentos de linhas de financiamento", () => {
    const r = montarRecorte(convenios, [], [], new Map());
    expect(r.instrumentos.map((l) => l.numero)).toEqual(["1", "2", "4"]);
    expect(r.confirmadas.map((l) => l.numero)).toEqual(["3"]);
    expect(r.total).toBe(4);
  });

  it("filtra por monitorado, propostas ou sem monitoramento", () => {
    const fases = new Map([
      ["1", "Em andamento"],
      ["3", "Concluído"],
    ]);
    const props = [proposta("9")];
    const ids = (m: string) =>
      montarRecorte(convenios, [], props, fases, m).linhas.map((l) =>
        l.grupo === "Proposta" ? "P" : l.numero,
      );
    expect(ids("monitorado")).toEqual(["1", "3"]);
    expect(ids("sem")).toEqual(["2", "4"]);
    expect(ids("propostas")).toEqual(["P"]);
  });

  it("parcerias e FAF firmados formam uma lista; o repetido conta uma vez", () => {
    const r = montarRecorte(
      convenios,
      [proposta("3"), proposta("9")],
      [proposta(null)],
      new Map([["3", "Em andamento"]]),
    );
    expect(r.confirmadas.map((l) => l.numero)).toEqual(["3", "9"]);
    expect(r.confirmadas.map((l) => l.tipo)).toEqual(["FAF", "FAF"]);
    expect(r.confirmadas[0].monitoramento).toBe("Em andamento");
    expect(r.total).toBe(2 + 3 + 1);
  });

  it("opções de contratação contam o recorte inteiro (instrumentos, linhas e propostas)", () => {
    const r = montarRecorte(
      convenios,
      [proposta("3"), proposta("9")],
      [proposta(null, "PRONON")],
      new Map(),
    );
    expect(opcoesContratacao(r)).toEqual([
      { value: "Convênio", label: "CONVÊNIO (1)" },
      { value: "TED", label: "TED (1)" },
      { value: "PERSUS I", label: "PERSUS I (1)" },
      { value: "FAF", label: "FAF (2)" },
      { value: "PRONON", label: "PRONON (1)" },
    ]);
  });
});
