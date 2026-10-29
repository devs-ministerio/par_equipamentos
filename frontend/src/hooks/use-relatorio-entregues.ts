import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { consultarEntregues } from "@/services/relatorios-entregues";
import type { FiltroRelatorio } from "@/services/relatorios";

export function useRelatorioEntregues(
  filtro: FiltroRelatorio,
  ativo: boolean,
) {
  const chave = JSON.stringify(filtro);
  const [paginacao, setPaginacao] = useState({ chave, pagina: 1 });
  const pagina = chave === paginacao.chave ? paginacao.pagina : 1;
  const query = useQuery({
    queryKey: ["relatorios-entregues", filtro, pagina],
    queryFn: ({ signal }) => consultarEntregues(filtro, pagina, signal),
    enabled: ativo,
    staleTime: 0,
    retry: false,
  });
  return {
    ...query,
    pagina,
    setPagina: (nova: number) => setPaginacao({ chave, pagina: nova }),
  };
}
