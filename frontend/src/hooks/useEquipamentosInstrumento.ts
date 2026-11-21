import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CorrigirUnidadeInput,
  type RegistrarEntregaInput,
  cancelarUnidadePlanejada,
  corrigirUnidade,
  definirPrevisaoEntrega,
  corrigirDataEntrega,
  excluirEntrega,
  fetchEquipamentos,
  reativarUnidadeCancelada,
  removerPrevisaoEntrega,
  registrarEntrega,
} from "@/services/entregas-equipamento";
import { monitoramentoKeys } from "./monitoramento-query-keys";

export const equipamentosKeys = {
  instrumento: (nr: string) => ["monitoramento", "equipamentos", nr] as const,
};

export function useEquipamentosInstrumento(nr: string) {
  return useQuery({
    queryKey: equipamentosKeys.instrumento(nr),
    queryFn: () => fetchEquipamentos(nr),
  });
}

/** Entrega muda também a linha do tempo, a fase e o resumo. */
function useInvalidarEntrega(nr: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({
      queryKey: equipamentosKeys.instrumento(nr),
    });
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

export function useCorrigirDataEntrega(nr: string) {
  const invalidar = useInvalidarEntrega(nr);
  return useMutation({
    mutationFn: (v: { entregaId: number; data: string; motivo: string }) =>
      corrigirDataEntrega(v.entregaId, v.data, v.motivo),
    onSuccess: invalidar,
  });
}

export function useCancelarUnidade(nr: string) {
  const invalidar = useInvalidarEntrega(nr);
  return useMutation({
    mutationFn: (v: { itemId: number; motivo: string }) =>
      cancelarUnidadePlanejada(v.itemId, v.motivo),
    onSuccess: invalidar,
  });
}

export function useReativarUnidade(nr: string) {
  const invalidar = useInvalidarEntrega(nr);
  return useMutation({
    mutationFn: (v: { cancelamentoId: number; motivo: string }) =>
      reativarUnidadeCancelada(v.cancelamentoId, v.motivo),
    onSuccess: invalidar,
  });
}

export function useDefinirPrevisaoEntrega(nr: string) {
  const invalidar = useInvalidarEntrega(nr);
  return useMutation({
    mutationFn: (v: { itemId: number; dataPrevista: string }) =>
      definirPrevisaoEntrega(v.itemId, v.dataPrevista),
    onSuccess: invalidar,
  });
}

export function useRemoverPrevisaoEntrega(nr: string) {
  const invalidar = useInvalidarEntrega(nr);
  return useMutation({
    mutationFn: (v: { itemId: number; motivo: string }) =>
      removerPrevisaoEntrega(v.itemId, v.motivo),
    onSuccess: invalidar,
  });
}
