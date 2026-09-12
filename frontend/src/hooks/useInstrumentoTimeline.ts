import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CadastroInstrumentoInput,
  type RegistrarEventoInput,
  fetchInstrumentoTimeline,
  patchCadastroInstrumento,
  registrarEvento,
} from '@/services/monitoramento';
import { monitoramentoKeys } from './monitoramento-query-keys';

/** Timeline completa de 1 instrumento (dados + eventos + valor ao vivo) --
 * `data === null` (sem erro) é o caso normal de "convênio sem instrumento
 * seedado" (404, ver fetchInstrumentoTimeline), diferente de `isError`
 * (falha de verdade). */
export function useInstrumentoTimeline(nrConvenio: string) {
  return useQuery({
    queryKey: monitoramentoKeys.instrumento(nrConvenio),
    queryFn: () => fetchInstrumentoTimeline(nrConvenio),
  });
}

/** PATCH de cadastro interno (técnico/nível/finalidade/modalidade +
 * responsável da execução) -- invalida a timeline do próprio instrumento e
 * a lista geral (overview/painel também mostram esses campos). */
export function useSalvarCadastroInstrumento(nrConvenio: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (corpo: CadastroInstrumentoInput) => patchCadastroInstrumento(nrConvenio, corpo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: monitoramentoKeys.instrumento(nrConvenio) });
      queryClient.invalidateQueries({ queryKey: monitoramentoKeys.instrumentos });
    },
  });
}

/** POST de evento de marco (fase geral/cronograma/regulatório) --
 * invalida a timeline (novo evento na lista), a lista geral (fase_atual
 * pode ter mudado) e o resumo agregado (distribuição por fase, licenças,
 * inaugurações). */
export function useRegistrarEvento(nrConvenio: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (corpo: RegistrarEventoInput) => registrarEvento(nrConvenio, corpo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: monitoramentoKeys.instrumento(nrConvenio) });
      queryClient.invalidateQueries({ queryKey: monitoramentoKeys.instrumentos });
      queryClient.invalidateQueries({ queryKey: monitoramentoKeys.resumo });
    },
  });
}
