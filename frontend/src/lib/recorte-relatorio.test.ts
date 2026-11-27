import { describe, expect, it } from "vitest";
import { mesclarOpcoes, propostaCombina } from "@/lib/recorte-relatorio";
import { criarPropostaPrevia } from "@/test-fixtures/relatorios-previa";

const marcador = (nome: string, relacao: string) => ({
  codigo: nome,
  nome,
  prioritario: true,
  descricao_original: nome,
  tipo_evidencia: "x",
  relacao,
  confianca: 1,
});

describe("recorte do relatório", () => {
  it("acrescenta valores exclusivos das propostas sem repetir", () => {
    const base = [{ value: "FAF", label: "FAF (2)" }];
    expect(
      mesclarOpcoes(base, ["FAF", "PRONON", "PRONON"]).map((o) => o.value),
    ).toEqual(["FAF", "PRONON"]);
  });

  it("proposta só combina com programa e equipamento que financia", () => {
    const p = criarPropostaPrevia(1, {
      nm_programa: "Pronon - Serviços",
      equipamentos: [
        marcador("Mamógrafo", "aquisicao"),
        marcador("Tomógrafo", "mencao"),
      ],
    });
    expect(
      propostaCombina(p, { programa: "PRONON - SERVICOS", equipamento: null }),
    ).toBe(true);
    expect(propostaCombina(p, { programa: "Outro", equipamento: null })).toBe(
      false,
    );
    expect(
      propostaCombina(p, { programa: null, equipamento: "Mamógrafo" }),
    ).toBe(true);
    expect(
      propostaCombina(p, { programa: null, equipamento: "Tomógrafo" }),
    ).toBe(false);
  });
});
