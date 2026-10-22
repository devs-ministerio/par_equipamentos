import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, mensagemSeguraDoErro } from "@/lib/api-error";
import type { AprovacaoLegadoInput } from "@/lib/validations/aprovacao-legado";
import {
  enviarAprovacaoLegado,
  fetchProvaLegado,
} from "@/services/aprovacao-legado";
import type { CandidatoLegado } from "@/services/candidatos-legados";
import { useAuthSession } from "./useAuthSession";

export function useAprovacaoLegado(
  candidato: CandidatoLegado,
  aberta: boolean,
) {
  const { usuarioAtual, tratarSessaoInvalida } = useAuthSession();
  const client = useQueryClient();
  const podeAprovar =
    usuarioAtual?.role === "admin" || usuarioAtual?.role === "gestor";
  const prova = useQuery({
    queryKey: [
      "prova-legado",
      usuarioAtual?.id,
      candidato.id,
      candidato.captura_id,
      candidato.versao,
    ],
    queryFn: () => fetchProvaLegado(candidato.id),
    enabled: aberta && podeAprovar,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const mutation = useMutation({
    mutationFn: (dados: AprovacaoLegadoInput) =>
      enviarAprovacaoLegado(candidato.id, dados),
    retry: false,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: ["candidatos-legados", usuarioAtual?.id],
        }),
        client.invalidateQueries({
          queryKey: ["historico-legado", usuarioAtual?.id, candidato.id],
        }),
        client.invalidateQueries({
          queryKey: ["prova-legado", usuarioAtual?.id, candidato.id],
        }),
        client.invalidateQueries({ queryKey: ["convenios-lista"] }),
        client.invalidateQueries({ queryKey: ["notificacoes"] }),
      ]);
      toast.success("Convênio aprovado e incluído em Instrumentos/programas.");
    },
    onError: (erro) => {
      if (erro instanceof ApiError && erro.status === 401)
        tratarSessaoInvalida();
      toast.error(mensagemSeguraDoErro(erro));
    },
  });
  return { podeAprovar, prova, mutation };
}
