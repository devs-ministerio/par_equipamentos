import { describe, expect, it } from "vitest";
import {
  prazosMedios,
  situacaoInauguracao,
  entregaInauguracaoPorAno,
  instrumentosParados,
} from "./painel-gestao-andamento";

const etapa = (nr: string, o: Record<string, unknown> = {}) => ({
  nr_convenio: nr,
  publicacao: null,
  entrega: null,
  inauguracao: null,
  conclusao: null,
  inauguracao_dispensada: false,
  conclusao_resultado: null,
  unidades_entregues: [],
  ...o,
});

describe("painel de gestão: andamento", () => {
  it("classifica a inauguração: realizada, dispensada, prevista e sem registro", () => {
    const etapas = [
      etapa("1", { inauguracao: "2025-01-10" }),
      etapa("2", { inauguracao_dispensada: true }),
      etapa("3"),
      etapa("4"),
    ];
    expect(
      situacaoInauguracao(
        new Set(["1", "2", "3", "4"]),
        etapas,
        new Set(["3"]),
      ),
    ).toEqual({ Realizada: 1, Dispensada: 1, Prevista: 1, "Sem registro": 1 });
  });

  it("calcula prazo médio só com as duas datas e descarta intervalo negativo", () => {
    const etapas = [
      etapa("1", { publicacao: "2024-01-01", entrega: "2024-01-11" }),
      etapa("2", { publicacao: "2024-01-01", entrega: "2024-01-21" }),
      etapa("3", { publicacao: "2024-02-01", entrega: "2024-01-01" }),
      etapa("4", { publicacao: "2024-01-01" }),
    ];
    const prazos = prazosMedios(new Set(["1", "2", "3", "4"]), etapas);
    expect(prazos).toEqual([
      { rotulo: "Publicação → entrega", dias: 15, instrumentos: 2 },
    ]);
  });

  it("separa parados por faixa e ignora concluídos", () => {
    const agora = new Date("2026-06-30T12:00:00").getTime();
    const instrumentos = [
      { nr_convenio: "1", fase_atual: "Aguardando repasse" },
      { nr_convenio: "2", fase_atual: "Aguardando repasse" },
      { nr_convenio: "3", fase_atual: "Concluído" },
      { nr_convenio: "4", fase_atual: "Aguardando repasse" },
    ] as never;
    const indicadores = [
      { nr_convenio: "1", ultima_atividade_em: "2026-06-20T00:00:00" },
      { nr_convenio: "2", ultima_atividade_em: "2026-03-01T00:00:00" },
      { nr_convenio: "3", ultima_atividade_em: "2020-01-01T00:00:00" },
      { nr_convenio: "4", ultima_atividade_em: null },
    ] as never;
    const r = instrumentosParados(instrumentos, indicadores, agora);
    expect(r.faixas.map((f) => f.quantidade)).toEqual([1, 0, 0, 1]);
    expect(r.semAtividade).toBe(1);
  });

  it("conta equipamentos entregues só com inauguração dispensada ou inaugurados e 100% concluídos", () => {
    const entregas = [
      { data: "2024-05-01", quantidade: 2 },
      { data: "2025-02-01", quantidade: 1 },
    ];
    const etapas = [
      etapa("1", {
        inauguracao_dispensada: true,
        unidades_entregues: entregas,
      }),
      etapa("2", {
        inauguracao: "2025-09-10",
        conclusao_resultado: "integral",
        unidades_entregues: entregas,
      }),
      etapa("3", {
        inauguracao: "2025-09-10",
        conclusao_resultado: null,
        unidades_entregues: [{ data: "2025-01-01", quantidade: 4 }],
      }),
      etapa("4", {
        unidades_entregues: [{ data: "2025-01-01", quantidade: 5 }],
      }),
    ];
    const r = entregaInauguracaoPorAno(new Set(["1", "2", "3", "4"]), etapas);
    expect(r.anos).toEqual([
      { ano: "2024", inaugurados: 0, dispensados: 2 },
      { ano: "2025", inaugurados: 3, dispensados: 1 },
    ]);
    expect(r.aguardando).toBe(9);
  });
});
