import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { licencaOperacaoKeys } from "@/hooks/useLicencaOperacao";
import {
  type DocumentoInput,
  corrigirDocumento,
  excluirDocumento,
  fetchDocumentos,
  registrarDocumento,
} from "@/services/documentos-instrumento";

export const documentosKeys = {
  instrumento: (nr: string) => ["monitoramento", "documentos", nr] as const,
};

export function useDocumentosInstrumento(nr: string) {
  return useQuery({
    queryKey: documentosKeys.instrumento(nr),
    queryFn: () => fetchDocumentos(nr),
  });
}

function useInvalidarDocumentos(nr: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: documentosKeys.instrumento(nr),
      }),
      queryClient.invalidateQueries({
        queryKey: licencaOperacaoKeys.instrumento(nr),
      }),
    ]);
}

export function useRegistrarDocumento(nr: string) {
  const invalidar = useInvalidarDocumentos(nr);
  return useMutation({
    mutationFn: (corpo: DocumentoInput) => registrarDocumento(nr, corpo),
    onSuccess: invalidar,
  });
}

export function useCorrigirDocumento(nr: string) {
  const invalidar = useInvalidarDocumentos(nr);
  return useMutation({
    mutationFn: (v: { id: number; corpo: DocumentoInput }) =>
      corrigirDocumento(v.id, v.corpo),
    onSuccess: invalidar,
  });
}

export function useExcluirDocumento(nr: string) {
  const invalidar = useInvalidarDocumentos(nr);
  return useMutation({
    mutationFn: (v: { id: number; motivo: string }) =>
      excluirDocumento(v.id, v.motivo),
    onSuccess: invalidar,
  });
}
