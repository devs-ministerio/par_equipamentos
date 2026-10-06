import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  enviarDecisaoLegado,
  fetchHistoricoLegado,
} from "@/services/candidatos-legados";
import type { DecisaoLegadoInput } from "@/lib/validations/decisao-legado";
import { mensagemSeguraDoErro, ApiError } from "@/lib/api-error";
import { useAuthSession } from "./useAuthSession";

export function useTriagemLegado(candidatoId: number) {
  const { usuarioAtual, tratarSessaoInvalida } = useAuthSession();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (dados: DecisaoLegadoInput) =>
      enviarDecisaoLegado(candidatoId, dados),
    retry: false,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: ["candidatos-legados", usuarioAtual?.id],
        }),
        client.invalidateQueries({
          queryKey: ["historico-legado", usuarioAtual?.id, candidatoId],
        }),
      ]);
      toast.success("Decisão registrada.");
    },
    onError: (erro) => {
      if (erro instanceof ApiError && erro.status === 401)
        tratarSessaoInvalida();
      toast.error(mensagemSeguraDoErro(erro));
    },
  });
  return {
    podeDecidir:
      usuarioAtual?.role === "admin" || usuarioAtual?.role === "gestor",
    mutation,
  };
}

export function useHistoricoLegado(
  candidatoId: number,
  aberta: boolean,
  pagina: number,
) {
  const { usuarioAtual, autenticado } = useAuthSession();
  return useQuery({
    queryKey: ["historico-legado", usuarioAtual?.id, candidatoId, pagina],
    queryFn: () => fetchHistoricoLegado(candidatoId, pagina),
    enabled: aberta && autenticado,
    staleTime: 30_000,
    retry: 1,
  });
}
