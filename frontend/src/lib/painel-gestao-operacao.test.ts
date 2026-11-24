import { describe, expect, it } from "vitest";
import {
  equipamentosPorSituacao,
  totaisOperacao,
} from "./painel-gestao-operacao";
import { entregaPorUf } from "./painel-gestao-entrega";

const etapa = (nr: string, o: Record<string, unknown> = {}) => ({
  nr_convenio: nr,
  publicacao: null,
  entrega: null,
  inauguracao: null,
  conclusao: null,
  inauguracao_dispensada: false,
  conclusao_resultado: null,
  tem_acelerador_linear: false,
  unidades_entregues: [],
  ...o,
});
const linha = (
  nr: string,
  familia: string,
  planejado: number,
  entregue: number,
) => ({
  nr_convenio: nr,
  familia,
  planejado,
  entregue,
});

describe("equipamentos: em operação, entregues e planejados", () => {
  const linhas = [
    linha("1", "Mamógrafo", 3, 2), // dispensada: em operação
    linha("2", "Mamógrafo", 2, 2), // ainda precisa de inauguração: entregue
    linha("3", "Mamógrafo", 4, 0), // nada entregue: planejado
    linha("4", "Braquiterapia", 1, 1), // inaugurada e concluída: em operação
  ];
  const etapas = [
    etapa("1", { inauguracao_dispensada: true }),
    etapa("2"),
    etapa("3"),
    etapa("4", { inauguracao: "2025-01-01", conclusao_resultado: "integral" }),
  ];

  it("separa por tipo e deixa o restante como planejado", () => {
    const f = equipamentosPorSituacao(
      linhas,
      new Set(["1", "2", "3", "4"]),
      etapas,
    );
    expect(f).toEqual([
      { familia: "Mamógrafo", planejado: 9, entregue: 2, operacao: 2 },
      { familia: "Braquiterapia", planejado: 1, entregue: 0, operacao: 1 },
    ]);
    expect(totaisOperacao(f)).toEqual({
      operacao: 3,
      entregue: 2,
      planejado: 10,
      restante: 5,
    });
  });

  it("inauguração realizada sem conclusão integral continua só entregue", () => {
    const f = equipamentosPorSituacao(
      [linha("5", "Mamógrafo", 1, 1)],
      new Set(["5"]),
      [etapa("5", { inauguracao: "2025-01-01" })],
    );
    expect(f[0]).toMatchObject({ operacao: 0, entregue: 1 });
  });

  it("entregue por UF usa a mesma separação", () => {
    const r = entregaPorUf(
      [
        { nr_convenio: "1", uf: "RS" },
        { nr_convenio: "2", uf: "RS" },
      ] as never,
      linhas.slice(0, 2),
      etapas,
    );
    expect(r).toEqual([{ uf: "RS", planejado: 5, entregue: 2, operacao: 2 }]);
  });
});
