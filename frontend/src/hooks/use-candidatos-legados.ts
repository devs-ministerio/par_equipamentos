import { useQuery } from "@tanstack/react-query";
import {
  fetchCandidatosLegados,
  type SituacaoLegado,
} from "@/services/candidatos-legados";
import { useAuthSession } from "./useAuthSession";

export function useCandidatosLegados(
  aberta: boolean,
  pagina: number,
  busca: string,
  situacao?: SituacaoLegado,
  atualizarPeriodicamente = false,
) {
  const { autenticado, usuarioAtual } = useAuthSession();
  return useQuery({
    queryKey: ["candidatos-legados", usuarioAtual?.id, pagina, busca, situacao],
    queryFn: () => fetchCandidatosLegados(pagina, busca, situacao),
    enabled: aberta && autenticado,
    staleTime: 30_000,
    retry: 1,
    refetchInterval: atualizarPeriodicamente ? 60_000 : false,
    refetchIntervalInBackground: false,
  });
}
