import { useQuery } from "@tanstack/react-query";
import { fetchCapturasFontes } from "@/services/fontes";
import { useAuthSession } from "./useAuthSession";

export function useFontes() {
  const { autenticado, usuarioAtual } = useAuthSession();
  return useQuery({
    queryKey: ["fontes", usuarioAtual?.id],
    queryFn: fetchCapturasFontes,
    enabled: autenticado,
    staleTime: 30_000,
    retry: 1,
    refetchInterval: autenticado ? 60_000 : false,
  });
}
