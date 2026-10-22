import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { consultarEncerrados } from "@/services/relatorios-encerrados";
import type { FiltroRelatorio } from "@/services/relatorios";

export function useRelatorioEncerrados(
  filtro: FiltroRelatorio,
  ativo: boolean,
) {
  const chave = JSON.stringify(filtro);
  const [paginacao, setPaginacao] = useState({
    chave,
    pagina: 1,
    pendencias: 1,
  });
  const pagina = chave === paginacao.chave ? paginacao.pagina : 1;
  const pendencias = chave === paginacao.chave ? paginacao.pendencias : 1;
  const query = useQuery({
    queryKey: ["relatorios-encerrados", filtro, pagina, pendencias],
    queryFn: ({ signal }) =>
      consultarEncerrados(filtro, pagina, pendencias, signal),
    enabled: ativo,
    staleTime: 0,
    retry: false,
  });
  return {
    ...query,
    pagina,
    paginaPendencias: pendencias,
    setPagina: (nova: number) =>
      setPaginacao({ chave, pagina: nova, pendencias }),
    setPaginaPendencias: (nova: number) =>
      setPaginacao({ chave, pagina, pendencias: nova }),
  };
}
