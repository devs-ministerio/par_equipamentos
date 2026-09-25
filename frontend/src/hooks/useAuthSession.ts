import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  type AuthUser,
  fetchCurrentUser,
  login,
  logout,
} from "@/services/auth";
import { limparCsrfToken } from "@/lib/csrf";
import { monitoramentoKeys } from "./monitoramento-query-keys";

/** Sessão do usuário operacional do monitoramento interno (login/logout +
 * usuário atual) -- extraído de MonitoramentoInterno.tsx pra hook próprio
 * (Seção 6/C da migração: lógica assíncrona nunca dentro do componente de
 * UI).
 *
 * Cookie HttpOnly (Plan Mode segurança 2026-09-16, Bloco 2) -- diferente
 * do token em `localStorage` de antes, JS não tem (nem precisa ter) acesso
 * ao valor da sessão. "Está logado?" deixa de ser uma leitura síncrona
 * local e vira sempre uma pergunta ao backend: `usuarioQuery` chama
 * `GET /auth/me` (que só responde 200 se o cookie for válido) e
 * `queryClient.setQueryData`/`invalidateQueries` nessa mesma chave
 * (`monitoramentoKeys.currentUser`) propaga pra toda instância montada de
 * `useAuthSession()` ao mesmo tempo (header + página), mesmo motivo do
 * design anterior (bug real evitado: deslogar num lugar não atualizava o
 * outro). */
export function useAuthSession() {
  const queryClient = useQueryClient();

  const usuarioQuery = useQuery({
    queryKey: monitoramentoKeys.currentUser,
    queryFn: fetchCurrentUser,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: (corpo: { email: string; senha: string }) =>
      login(corpo.email, corpo.senha),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: monitoramentoKeys.currentUser,
      });
    },
  });

  async function sair() {
    // A transição local não depende da latência da API. Mantemos somente a
    // chave de sessão como visitante para que /login não refaça /auth/me
    // com o cookie que ainda está sendo apagado no servidor.
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== "auth",
    });
    queryClient.setQueryData(monitoramentoKeys.currentUser, null);
    try {
      await logout();
    } catch {
      // Sem rede não é possível revogar remotamente. O usuário já saiu da
      // interface e recebe um aviso sem expor o detalhe técnico da falha.
      toast.error("Não foi possível confirmar a saída no servidor.");
    } finally {
      // A API também invalida o cookie. Este é só o espelho em memória
      // usado pela topologia Vercel → Render, que não deve sobreviver à saída.
      limparCsrfToken();
    }
  }

  /** Chamado pelas mutações de escrita do módulo quando o backend recusa
   * por falta de sessão -- mesmo papel do antigo `tratarErroEscrita`. Só
   * força a query a revalidar; `requisitar` (services/monitoramento.ts) já
   * tentou renovar via /auth/refresh antes de deixar o 401 chegar aqui. */
  function tratarSessaoInvalida() {
    queryClient.invalidateQueries({ queryKey: monitoramentoKeys.currentUser });
  }

  const usuarioAtual: AuthUser | null = usuarioQuery.data ?? null;

  return {
    usuarioAtual,
    autenticado: Boolean(usuarioAtual),
    podeEditar:
      usuarioAtual?.role === "admin" || usuarioAtual?.role === "gestor" || usuarioAtual?.role === "colaborador",
    checandoSessao: usuarioQuery.isLoading,
    login: loginMutation.mutateAsync,
    loginPendente: loginMutation.isPending,
    erroLogin: loginMutation.error,
    erroSessao: usuarioQuery.error,
    tentarNovamenteSessao: usuarioQuery.refetch,
    sair,
    tratarSessaoInvalida,
  };
}
