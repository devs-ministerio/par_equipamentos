import { describe, expect, it } from "vitest";
import type { InstrumentoEquipamento } from "@/services/monitoramento-instrumentos";
import { resumirCarteiraPainel } from "./monitoramento-painel-analise";

function instrumento(
  fase: string | null,
  ano: number | null,
  tipo: string | null,
  uf: string | null,
): InstrumentoEquipamento {
  return {
    fase_atual: fase,
    ano_instrumento: ano,
    tipo_contratacao: tipo,
    uf,
  } as InstrumentoEquipamento;
}

describe("resumirCarteiraPainel", () => {
  it("mantém as fases na ordem do catálogo e conta ano, contratação e UF sem inventar dados", () => {
    const resumo = resumirCarteiraPainel(
      [
        instrumento("Concluído", 2025, "Convênio", "SP"),
        instrumento(null, 2024, "FAF", "SP"),
        instrumento("Fase extra", null, null, null),
      ],
      ["Não iniciado", "Em execução", "Concluído"],
    );

    expect(resumo.fases.map((item) => [item.rotulo, item.quantidade])).toEqual([
      ["Não iniciado", 1],
      ["Em execução", 0],
      ["Concluído", 1],
      ["Fase extra", 1],
    ]);
    expect(resumo.anos.map((item) => item.rotulo)).toEqual(["2024", "2025"]);
    expect(resumo.semAno).toBe(1);
    expect(resumo.contratacoes.map((item) => item.rotulo)).toEqual([
      "Convênio",
      "FAF",
      "Não informado",
    ]);
    expect(resumo.ufs[0]).toEqual({ rotulo: "SP", quantidade: 2 });
    expect(resumo.semUf).toBe(1);
    expect(resumo.concentracaoTop5Uf).toBe(67);
  });

  it("retorna séries vazias e concentração zero sem instrumentos", () => {
    const resumo = resumirCarteiraPainel([], ["Não iniciado"]);
    expect(resumo.fases).toEqual([{ rotulo: "Não iniciado", quantidade: 0 }]);
    expect(resumo.anos).toEqual([]);
    expect(resumo.contratacoes).toEqual([]);
    expect(resumo.concentracaoTop5Uf).toBe(0);
  });
});
