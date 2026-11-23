import { useQuery } from "@tanstack/react-query";
import {
  fetchCarteiraTecnico,
  fetchPainelTecnico,
  fetchTecnicosPainel,
} from "@/services/painel-tecnico";

export function usePainelTecnico(usuarioId?: number, habilitado = true) {
  return useQuery({
    queryKey: ["painel-tecnico", usuarioId ?? "padrao"] as const,
    queryFn: () => fetchPainelTecnico(usuarioId),
    enabled: habilitado,
  });
}

/** Lista para o filtro por colaborador; só gestor e admin chamam. */
export function useTecnicosPainel(habilitado: boolean) {
  return useQuery({
    queryKey: ["painel-tecnico", "tecnicos"] as const,
    queryFn: fetchTecnicosPainel,
    enabled: habilitado,
  });
}

export function useCarteiraTecnico(usuarioId?: number) {
  return useQuery({
    queryKey: ["painel-tecnico", "carteira", usuarioId ?? "padrao"] as const,
    queryFn: () => fetchCarteiraTecnico(usuarioId),
  });
}
