import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ConcluirInput,
  concluirAcompanhamento,
  fetchAvaliacaoConclusao,
  reabrirAcompanhamento,
} from "@/services/conclusao-acompanhamento";
import { equipamentosKeys } from "./useEquipamentosInstrumento";
import { monitoramentoKeys } from "./monitoramento-query-keys";
import { repasseKeys } from "./useRepasseInstrumento";

export const conclusaoKeys = {
  instrumento: (nr: string) => [...monitoramentoKeys.conclusao, nr] as const,
};

export function useAvaliacaoConclusao(nr: string) {
  return useQuery({
    queryKey: conclusaoKeys.instrumento(nr),
    queryFn: () => fetchAvaliacaoConclusao(nr),
  });
}

/** Concluir ou reabrir muda a fase, as entregas liberadas e o resumo. */
function useInvalidarConclusao(nr: string) {
  const queryClient = useQueryClient();
  return () => {
    for (const queryKey of [
      conclusaoKeys.instrumento(nr),
      repasseKeys.instrumento(nr),
      equipamentosKeys.instrumento(nr),
      monitoramentoKeys.instrumento(nr),
      monitoramentoKeys.resumo,
      monitoramentoKeys.instrumentos,
    ])
      queryClient.invalidateQueries({ queryKey });
  };
}

export function useConcluirAcompanhamento(nr: string) {
  const invalidar = useInvalidarConclusao(nr);
  return useMutation({
    mutationFn: (corpo: ConcluirInput) => concluirAcompanhamento(nr, corpo),
    onSuccess: invalidar,
  });
}

export function useReabrirAcompanhamento(nr: string) {
  const invalidar = useInvalidarConclusao(nr);
  return useMutation({
    mutationFn: (motivo: string) => reabrirAcompanhamento(nr, motivo),
    onSuccess: invalidar,
  });
}
