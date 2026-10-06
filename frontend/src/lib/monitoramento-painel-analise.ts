import type { InstrumentoEquipamento } from "@/services/monitoramento-instrumentos";

export interface FaixaPainel {
  rotulo: string;
  quantidade: number;
}

function contar(rotulos: string[]): FaixaPainel[] {
  const contagem = new Map<string, number>();
  for (const rotulo of rotulos) {
    contagem.set(rotulo, (contagem.get(rotulo) ?? 0) + 1);
  }
  return [...contagem].map(([rotulo, quantidade]) => ({ rotulo, quantidade }));
}

export function resumirCarteiraPainel(
  instrumentos: InstrumentoEquipamento[],
  ordemFases: string[],
) {
  const fasesContadas = new Map(
    contar(instrumentos.map((item) => item.fase_atual ?? "Não iniciado")).map(
      (item) => [item.rotulo, item.quantidade],
    ),
  );
  const fases = [
    ...ordemFases.map((rotulo) => ({
      rotulo,
      quantidade: fasesContadas.get(rotulo) ?? 0,
    })),
    ...[...fasesContadas]
      .filter(([rotulo]) => !ordemFases.includes(rotulo))
      .map(([rotulo, quantidade]) => ({ rotulo, quantidade })),
  ];
  const todosAnos = contar(
    instrumentos.map((item) =>
      item.ano_instrumento != null &&
      Number.isInteger(item.ano_instrumento) &&
      item.ano_instrumento >= 1900 &&
      item.ano_instrumento <= 2100
        ? String(item.ano_instrumento)
        : "Sem ano",
    ),
  ).sort((a, b) => {
    if (a.rotulo === "Sem ano") return 1;
    if (b.rotulo === "Sem ano") return -1;
    return Number(a.rotulo) - Number(b.rotulo);
  });
  const anosValidos = todosAnos.filter((item) => item.rotulo !== "Sem ano");
  const anos = anosValidos.slice(-8);
  const semAno =
    todosAnos.find((item) => item.rotulo === "Sem ano")?.quantidade ?? 0;
  const contratacoes = contar(
    instrumentos.map((item) => item.tipo_contratacao || "Não informado"),
  ).sort((a, b) => b.quantidade - a.quantidade);
  const ufsContadas = contar(
    instrumentos.map((item) => item.uf || "Não informado"),
  );
  const semUf =
    ufsContadas.find((item) => item.rotulo === "Não informado")?.quantidade ??
    0;
  const ufs = ufsContadas
    .filter((item) => item.rotulo !== "Não informado")
    .sort((a, b) => b.quantidade - a.quantidade);
  const totalTop5Uf = ufs
    .slice(0, 5)
    .reduce((soma, item) => soma + item.quantidade, 0);

  return {
    fases,
    anos,
    anosOmitidos: Math.max(0, anosValidos.length - anos.length),
    semAno,
    contratacoes,
    ufs,
    semUf,
    concentracaoTop5Uf: instrumentos.length
      ? Math.round((totalTop5Uf / instrumentos.length) * 100)
      : 0,
  };
}
