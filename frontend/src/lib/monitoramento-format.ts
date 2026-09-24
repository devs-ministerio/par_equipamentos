/** Dias até `dataIso` (negativo = já venceu) -- usado no contador de
 * validade da licença de operação e no prazo de ações/inaugurações. `null`
 * quando não há data pra calcular. Movido de MonitoramentoInterno.tsx
 * (Seção 6 da migração) pra ser reaproveitado pelos subcomponentes depois
 * do split, sem duplicar a mesma conta em 3 arquivos. */
export function diasAte(dataIso: string | null | undefined): number | null {
  if (!dataIso) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(dataIso + "T00:00:00");
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
}

export function fmtMoeda(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

/** Aceita data SICONV, ISO de data ou datetime e sempre devolve dd/mm/aaaa. */
export function fmtData(s: string | null | undefined): string {
  if (!s) return "—";
  if (s.includes("/")) return s;
  const [ano, mes, dia] = s.split("T")[0].split("-");
  return `${dia}/${mes}/${ano}`;
}

/** O dump SICONV (public/monitoramento-equipamentos/siconv.json) tem texto
 * com acento corrompido em ~430 pontos -- byte perdido na geração do
 * arquivo (upstream, fora do nosso controle), virou "?" literal (ex.
 * "ATEN??O" em vez de "ATENÇÃO"). Achado 2026-09-12: como é um vocabulário
 * burocrático pequeno e 100% repetido (nome de programa/ação), dá pra
 * corrigir com confiança alta só na exibição, sem tocar o dado de origem.
 * Cobre só as ~354 ocorrências desse vocabulário fechado -- "?" solto em
 * texto livre (descrição de item, justificativa) fica como está: não dá
 * pra adivinhar o caractere original sem risco de inventar dado errado. */
const CORRECOES_SICONV: [RegExp, string][] = [
  // Frase inteira primeiro -- "?" solto (a crase de "À SAÚDE") só é seguro
  // de corrigir nesse contexto exato, confirmado comparando com a versão
  // não corrompida do mesmo nome de programa presente no mesmo arquivo.
  [/ATEN\?\?O ESPECIALIZADA \? SA\?DE/g, "ATENÇÃO ESPECIALIZADA À SAÚDE"],
  [/ATEN\?\?O/g, "ATENÇÃO"],
  [/SA\?DE/g, "SAÚDE"],
  [/ESTRUTURA\?\?O/g, "ESTRUTURAÇÃO"],
  [/AQUISI\?\?O/g, "AQUISIÇÃO"],
  [/CONV\?NIO/g, "CONVÊNIO"],
  [/OR\?AMENTO/g, "ORÇAMENTO"],
  [/FILANTR\?PICAS/g, "FILANTRÓPICAS"],
  [/A\?\?O/g, "AÇÃO"],
];

export function corrigirTextoSiconv(texto: string): string;
export function corrigirTextoSiconv(texto: string | null): string | null;
export function corrigirTextoSiconv(
  texto: string | null | undefined,
): string | null | undefined;
export function corrigirTextoSiconv(
  texto: string | null | undefined,
): string | null | undefined {
  if (!texto) return texto;
  let corrigido = texto;
  for (const [padrao, substituicao] of CORRECOES_SICONV) {
    corrigido = corrigido.replace(padrao, substituicao);
  }
  return corrigido;
}

/** "71% do global" -- legenda curta pra por embaixo de um valor monetario
 * (ver Campo em ui.tsx). `undefined` quando falta numerador ou denominador
 * (nunca mostra "0%" ou "NaN%" por dado ausente). */
export function pct(
  parte: number | null | undefined,
  total: number | null | undefined,
  sufixo: string,
): string | undefined {
  if (parte == null || !total) return undefined;
  return `${Math.round((parte / total) * 100)}% ${sufixo}`;
}
