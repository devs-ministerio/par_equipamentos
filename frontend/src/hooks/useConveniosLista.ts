import { useQuery } from "@tanstack/react-query";
import { fetchConvenios } from "@/services/convenios";

/** Universo inteiro de convênios de uma vez (paginação real do backend
 * existe, mas as telas que consomem isso -- Dados oficiais, Painel de
 * Gestão -- precisam do total pra ranking/financeiro, não de uma página
 * por vez). Mesma `queryKey` nos dois consumidores -- abrir qualquer uma
 * das duas telas já esquenta o cache da outra. */
export function useConveniosLista() {
  return useQuery({
    queryKey: ["convenios-lista"],
    // 1000 > universo hoje (581, ver CLAUDE.md) -- subiu de 500 na
    // correção 2026-09-18 (FAF/TED/PERSUS I/PERSUS II/PRONON entraram no
    // universo de "Instrumentos firmados").
    queryFn: () => fetchConvenios({ tamanhoPagina: 1000 }),
  });
}
