import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CorrigirUnidadeInput,
  type ItemEntregaInput,
  type RegistrarEntregaInput,
  corrigirUnidade,
  excluirEntrega,
  fetchEntregasLegadas,
  fetchEquipamentos,
  registrarEntrega,
  vincularEntregaLegada,
} from "@/services/entregas-equipamento";
import { monitoramentoKeys } from "./monitoramento-query-keys";

export const equipamentosKeys = {
  instrumento: (nr: string) => ["monitoramento", "equipamentos", nr] as const,
  legadas: ["monitoramento", "entregas-legadas"] as const,
};

export function useEquipamentosInstrumento(nr: string) {
  return useQuery({
    queryKey: equipamentosKeys.instrumento(nr),
    queryFn: () => fetchEquipamentos(nr),
  });
}

export function useEntregasLegadas() {
  return useQuery({
    queryKey: equipamentosKeys.legadas,
    queryFn: fetchEntregasLegadas,
  });
}

/** Entrega muda também a linha do tempo, a fase e o resumo. */
function useInvalidarEntrega(nr: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({
      queryKey: equipamentosKeys.instrumento(nr),
    });
    queryClient.invalidateQueries({ queryKey: equipamentosKeys.legadas });
    queryClient.invalidateQueries({
      queryKey: monitoramentoKeys.instrumento(nr),
    });
    queryClient.invalidateQueries({ queryKey: monitoramentoKeys.resumo });
    queryClient.invalidateQueries({ queryKey: monitoramentoKeys.instrumentos });
  };
}

export function useRegistrarEntrega(nr: string) {
  const invalidar = useInvalidarEntrega(nr);
  return useMutation({
    mutationFn: (corpo: RegistrarEntregaInput) => registrarEntrega(nr, corpo),
    onSuccess: invalidar,
  });
}

export function useVincularEntregaLegada(nr: string) {
  const invalidar = useInvalidarEntrega(nr);
  return useMutation({
    mutationFn: (v: { revisaoId: number; itens: ItemEntregaInput[] }) =>
      vincularEntregaLegada(v.revisaoId, v.itens),
    onSuccess: invalidar,
  });
}

export function useCorrigirUnidade(nr: string) {
  const invalidar = useInvalidarEntrega(nr);
  return useMutation({
    mutationFn: (v: { unidadeId: number; corpo: CorrigirUnidadeInput }) =>
      corrigirUnidade(v.unidadeId, v.corpo),
    onSuccess: invalidar,
  });
}

export function useExcluirEntrega(nr: string) {
  const invalidar = useInvalidarEntrega(nr);
  return useMutation({
    mutationFn: (v: { entregaId: number; motivo: string }) =>
      excluirEntrega(v.entregaId, v.motivo),
    onSuccess: invalidar,
  });
}
