import { describe, expect, it } from "vitest";
import {
  mesclarOpcoes,
  opcoesSituacaoDaVisao,
  origensDaVisao,
  propostaCombina,
  situacaoVale,
} from "@/lib/recorte-relatorio";
import { codificarSituacao } from "@/lib/situacao-relatorio";
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
  it("cada visão aceita só as origens de situação com efeito", () => {
    expect(origensDaVisao(null)).toHaveLength(3);
    expect(origensDaVisao("entregues")).toEqual([]);
    expect(origensDaVisao("previsoes")).toEqual(["monitoramento"]);
    expect(origensDaVisao("encerrados")).toEqual(["instrumento", "proposta"]);
  });

  it("descarta a situação escolhida quando a visão a ignora", () => {
    const fase = codificarSituacao("monitoramento", "Em licitação");
    expect(situacaoVale(fase, "encerrados")).toBe(false);
    expect(situacaoVale(fase, "previsoes")).toBe(true);
    expect(situacaoVale(null, "entregues")).toBe(true);
  });

  it("lista só as situações da visão", () => {
    const opcoes = [
      { value: codificarSituacao("instrumento", "A"), label: "A" },
      { value: codificarSituacao("monitoramento", "B"), label: "B" },
    ];
    expect(
      opcoesSituacaoDaVisao(opcoes, "previsoes").map((o) => o.label),
    ).toEqual(["B"]);
  });

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
