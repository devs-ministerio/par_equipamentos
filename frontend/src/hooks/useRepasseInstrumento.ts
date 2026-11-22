import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ConfirmarRepasseInput,
  confirmarRepasse,
  fetchSituacaoRepasse,
} from "@/services/repasses";
import { monitoramentoKeys } from "./monitoramento-query-keys";

export const repasseKeys = {
  instrumento: (nr: string) => ["monitoramento", "repasse", nr] as const,
};

export function useSituacaoRepasse(nr: string) {
  return useQuery({
    queryKey: repasseKeys.instrumento(nr),
    queryFn: () => fetchSituacaoRepasse(nr),
  });
}

/** Repasse muda a fase calculada: invalida também o instrumento, o resumo e a lista. */
export function useConfirmarRepasse(nr: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (corpo: ConfirmarRepasseInput) => confirmarRepasse(nr, corpo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repasseKeys.instrumento(nr) });
      queryClient.invalidateQueries({
        queryKey: monitoramentoKeys.instrumento(nr),
      });
      queryClient.invalidateQueries({ queryKey: monitoramentoKeys.resumo });
      queryClient.invalidateQueries({
        queryKey: monitoramentoKeys.instrumentos,
      });
    },
  });
}
