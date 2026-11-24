import { normalizarTexto } from "@/utils/texto";
import { aplicaFiltro, type FiltroCarteira } from "@/lib/painel-tecnico-filtro";
import type { LinhaCarteira } from "@/services/painel-tecnico";

export type ChaveOrdem =
  | "numero"
  | "municipio"
  | "situacao"
  | "valor"
  | "acoes"
  | "eventos";

export interface OrdemCarteira {
  chave: ChaveOrdem;
  dir: "asc" | "desc";
}

function valorOrdem(l: LinhaCarteira, c: ChaveOrdem): string | number {
  if (c === "valor") return l.valor_global ?? -1;
  if (c === "acoes") return l.acoes;
  if (c === "eventos") return l.eventos;
  if (c === "municipio") return `${l.uf ?? ""} ${l.municipio ?? ""}`;
  if (c === "situacao") return (l.monitorado ? l.fase : l.situacao) ?? "";
  return l.numero;
}

/** Aplica o filtro rápido e a busca livre e ordena a carteira. */
export function filtrarEOrdenarCarteira(
  linhas: LinhaCarteira[],
  filtro: FiltroCarteira,
  busca: string,
  ordem: OrdemCarteira,
): LinhaCarteira[] {
  const termo = normalizarTexto(busca);
  const lista = linhas.filter(
    (l) =>
      aplicaFiltro(l, filtro) &&
      (!termo ||
        normalizarTexto(
          `${l.numero} ${l.municipio ?? ""} ${l.uf ?? ""} ${l.cnes ?? ""} ${l.convenente ?? ""} ${l.titular ?? ""}`,
        ).includes(termo)),
  );
  const sinal = ordem.dir === "asc" ? 1 : -1;
  return [...lista].sort((a, b) => {
    const x = valorOrdem(a, ordem.chave);
    const y = valorOrdem(b, ordem.chave);
    return (x < y ? -1 : x > y ? 1 : 0) * sinal;
  });
}
