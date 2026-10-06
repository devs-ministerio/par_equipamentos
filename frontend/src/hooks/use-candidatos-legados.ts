import { useQuery } from "@tanstack/react-query";
import {
  fetchCandidatosLegados,
  type ConfirmacaoLegado,
} from "@/services/candidatos-legados";
import { useAuthSession } from "./useAuthSession";

export function useCandidatosLegados(
  aberta: boolean,
  pagina: number,
  busca: string,
  confirmacao?: ConfirmacaoLegado,
) {
  const { autenticado, usuarioAtual } = useAuthSession();
  return useQuery({
    queryKey: [
      "candidatos-legados",
      usuarioAtual?.id,
      pagina,
      busca,
      confirmacao,
    ],
    queryFn: () => fetchCandidatosLegados(pagina, busca, confirmacao),
    enabled: aberta && autenticado,
    staleTime: 30_000,
    retry: 1,
  });
}
