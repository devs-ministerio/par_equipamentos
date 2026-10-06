import { useEffect, useState } from "react";

export function useListaPaginada(
  total: number,
  tamanho: number,
  chave: string,
) {
  const [paginaSolicitada, definirPagina] = useState(1);
  useEffect(() => definirPagina(1), [chave]);
  const totalPaginas = Math.max(1, Math.ceil(total / tamanho));
  const pagina = Math.min(paginaSolicitada, totalPaginas);
  return { pagina, definirPagina, inicio: (pagina - 1) * tamanho };
}
