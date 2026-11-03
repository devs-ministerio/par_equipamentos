import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { consultarPrevisoes } from "@/services/relatorios-previsoes";
import type { FiltroRelatorio } from "@/services/relatorios";

export function useRelatorioPrevisoes(filtro: FiltroRelatorio, ativo: boolean) {
  const chave = JSON.stringify(filtro);
  const [paginacao, setPaginacao] = useState({ chave, pagina: 1 });
  const pagina = chave === paginacao.chave ? paginacao.pagina : 1;
  const query = useQuery({
    queryKey: ["relatorios-previsoes", filtro, pagina],
    queryFn: ({ signal }) => consultarPrevisoes(filtro, pagina, signal),
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
