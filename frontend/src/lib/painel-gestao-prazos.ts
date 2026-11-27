import { dias, type Etapas } from "@/lib/painel-gestao-andamento";

export interface PrazoMedio {
  rotulo: string;
  dias: number;
  instrumentos: number;
}

const INTERVALOS: Array<{
  rotulo: string;
  de: keyof Etapas;
  ate: keyof Etapas;
}> = [
  { rotulo: "Publicação → entrega", de: "publicacao", ate: "entrega" },
  { rotulo: "Entrega → inauguração", de: "entrega", ate: "inauguracao" },
  { rotulo: "Entrega → conclusão", de: "entrega", ate: "conclusao" },
  { rotulo: "Publicação → conclusão", de: "publicacao", ate: "conclusao" },
];

/** Média de dias entre etapas, só dos instrumentos com as duas datas (intervalo negativo é descartado). */
export function prazosMedios(
  numeros: ReadonlySet<string>,
  etapas: Etapas[],
): PrazoMedio[] {
  return INTERVALOS.map(({ rotulo, de, ate }) => {
    const valores = etapas
      .filter((e) => numeros.has(e.nr_convenio))
      .flatMap((e) => {
        const inicio = e[de];
        const fim = e[ate];
        if (typeof inicio !== "string" || typeof fim !== "string") return [];
        const d = dias(inicio, fim);
        return d >= 0 ? [d] : [];
      });
    return {
      rotulo,
      dias: valores.length
        ? Math.round(valores.reduce((s, v) => s + v, 0) / valores.length)
        : 0,
      instrumentos: valores.length,
    };
  }).filter((p) => p.instrumentos > 0);
}

/** Instrumentos que entram na média de um intervalo (têm as duas datas, em ordem). */
export function instrumentosDoPrazo(
  rotulo: string,
  numeros: ReadonlySet<string>,
  etapas: Etapas[],
): Set<string> {
  const intervalo = INTERVALOS.find((i) => i.rotulo === rotulo);
  const resultado = new Set<string>();
  if (!intervalo) return resultado;
  for (const e of etapas) {
    if (!numeros.has(e.nr_convenio)) continue;
    const inicio = e[intervalo.de];
    const fim = e[intervalo.ate];
    if (
      typeof inicio === "string" &&
      typeof fim === "string" &&
      dias(inicio, fim) >= 0
    )
      resultado.add(e.nr_convenio);
  }
  return resultado;
}
