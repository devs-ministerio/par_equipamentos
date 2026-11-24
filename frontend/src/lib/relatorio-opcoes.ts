import { capitalizarNome, normalizarTexto } from "@/utils/texto";
import type { ConvenioUnificado } from "@/types/monitoramento";

const TEM_ACENTO = /[À-ÖØ-öø-ÿ]/;

/** Deduplica por grafia (mesmo município/estabelecimento grafado diferente
 * por origem -- achado 2026-09-26, "não da pra ter dois São Paulo um
 * minúsculo, um maiúsculo e um sem acento"): `value` é a chave normalizada
 * (comparável direto contra `normalizarTexto(campo)`), `label` prefere a
 * grafia acentuada quando alguma variante tem, senão capitaliza a que
 * tiver. */
export function opcoesAgrupadas(
  itens: ConvenioUnificado[],
  valor: (
    item: ConvenioUnificado,
  ) => string | null | undefined | (string | null | undefined)[],
): { value: string; label: string }[] {
  const grupos = new Map<string, string[]>();
  for (const item of itens) {
    const encontrado = valor(item);
    for (const bruto of Array.isArray(encontrado) ? encontrado : [encontrado]) {
      if (!bruto) continue;
      const chave = normalizarTexto(bruto);
      const lista = grupos.get(chave);
      if (lista) lista.push(bruto);
      else grupos.set(chave, [bruto]);
    }
  }
  return [...grupos.entries()]
    .map(([chave, brutos]) => ({
      value: chave,
      label: capitalizarNome(
        brutos.find((b) => TEM_ACENTO.test(b)) ?? brutos[0],
      ),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export function opcoesUnicas(
  itens: ConvenioUnificado[],
  valor: (item: ConvenioUnificado) => string | null | undefined,
) {
  return [...new Set(itens.map(valor).filter((v): v is string => Boolean(v)))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((v) => ({ value: v, label: v }));
}
