import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type DecisaoItemInput,
  decidirItem,
  fetchFilaClassificacao,
} from "@/services/classificacao-itens";

const CHAVE = ["monitoramento", "classificacao", "fila"] as const;

export function useFilaClassificacao(habilitada: boolean) {
  return useQuery({
    queryKey: CHAVE,
    queryFn: fetchFilaClassificacao,
    enabled: habilitada,
  });
}

export function useDecidirItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { itemId: number; corpo: DecisaoItemInput }) =>
      decidirItem(v.itemId, v.corpo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHAVE });
      queryClient.invalidateQueries({
        queryKey: ["monitoramento", "equipamentos"],
      });
    },
  });
}
