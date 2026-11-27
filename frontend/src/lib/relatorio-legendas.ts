import { normalizarTexto } from "@/utils/texto";

const SINGULAR_PLURAL: Record<string, [string, string]> = {
  convenio: ["CONVÊNIO", "CONVÊNIOS"],
  faf: ["FAF", "FAFs"],
  ted: ["TED", "TEDs"],
  "persus i": ["PERSUS I", "PERSUS I"],
  "persus ii": ["PERSUS II", "PERSUS II"],
  aprovada: ["aprovada", "aprovadas"],
  rejeitada: ["rejeitada", "rejeitadas"],
  "em elaboracao": ["em elaboração", "em elaboração"],
  "em analise": ["em análise", "em análise"],
};

const ORDEM = [
  "convenio",
  "persus i",
  "persus ii",
  "faf",
  "ted",
  "aprovada",
  "em analise",
  "em elaboracao",
  "rejeitada",
];

function juntar(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? "—";
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

/** Legenda de KPI: "10 Convênios, 10 PERSUS I e 5 PERSUS II". Conta os valores informados, na ordem fixa do funil. */
export function legendaPorContagem(valores: (string | null | undefined)[]) {
  const contagem = new Map<string, { n: number; rotulo: string }>();
  for (const bruto of valores) {
    const rotulo = (bruto ?? "").trim();
    if (!rotulo) continue;
    const chave = normalizarTexto(rotulo);
    const atual = contagem.get(chave);
    if (atual) atual.n += 1;
    else contagem.set(chave, { n: 1, rotulo });
  }
  const posicao = (c: string) => {
    const i = ORDEM.indexOf(c);
    return i === -1 ? ORDEM.length : i;
  };
  const partes = [...contagem.entries()]
    .sort(([a], [b]) => posicao(a) - posicao(b))
    .map(([chave, { n, rotulo }]) => {
      const forma = SINGULAR_PLURAL[chave];
      const texto = forma ? forma[n === 1 ? 0 : 1] : rotulo.toLowerCase();
      return `${n.toLocaleString("pt-BR")} ${texto}`;
    });
  return juntar(partes);
}
