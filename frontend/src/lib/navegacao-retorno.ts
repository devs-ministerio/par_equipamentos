/** Navegação entre lista e detalhe.
 *
 * Filtros e paginação vivem na URL das listas. Ao entrar em um detalhe,
 * carregamos essa URL como `retorno` para que o botão Voltar consiga
 * reconstruir o mesmo recorte inclusive após recarregar a página.
 *
 * Nunca aceitamos uma URL externa: o parâmetro vem do browser e precisa ser
 * validado antes de virar destino de navegação. */
import type { Location } from "react-router-dom";

const ORIGENS_PERMITIDAS = new Map<string, string>([
  ["/monitoramento-equipamentos", "Instrumentos e repasses"],
  ["/monitoramento-equipamentos/instrumentos", "Mesa de trabalho"],
  ["/monitoramento-equipamentos/painel", "Painel de gestão"],
  ["/monitoramento-equipamentos/relatorios", "Relatórios"],
  ["/monitoramento-equipamentos/custeio", "Linhas de custeio"],
]);

export const RETORNO_PARAM = "retorno";

export function caminhoAtual(
  location: Pick<Location, "pathname" | "search" | "hash">,
): string {
  return `${location.pathname}${location.search}${location.hash}`;
}

export function destinoDeRetorno(
  search: string,
  fallback: string,
): { href: string; rotulo: string } {
  const retorno = new URLSearchParams(search).get(RETORNO_PARAM);
  const destinoPadrao = {
    href: fallback,
    rotulo: ORIGENS_PERMITIDAS.get(fallback) ?? "página anterior",
  };
  if (!retorno) return destinoPadrao;

  const url = urlInternaPermitida(retorno);
  if (!url) return destinoPadrao;

  return {
    href: `${url.pathname}${url.search}${url.hash}`,
    rotulo: ORIGENS_PERMITIDAS.get(url.pathname) ?? "página anterior",
  };
}

export function urlDetalheInstrumento(
  nrConvenio: string,
  retorno?: string,
): string {
  const caminho = `/monitoramento-equipamentos/instrumentos/${encodeURIComponent(nrConvenio)}`;
  if (!retorno || !urlInternaPermitida(retorno)) return caminho;

  const parametros = new URLSearchParams([[RETORNO_PARAM, retorno]]);
  return `${caminho}?${parametros.toString()}`;
}

function urlInternaPermitida(caminho: string): URL | null {
  // `//host` é uma URL scheme-relative, portanto não é rota interna.
  if (!caminho.startsWith("/") || caminho.startsWith("//")) return null;

  const url = new URL(caminho, "https://sigeo.local");
  return ORIGENS_PERMITIDAS.has(url.pathname) ? url : null;
}
