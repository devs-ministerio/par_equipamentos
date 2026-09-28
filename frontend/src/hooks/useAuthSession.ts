import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-error";
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
    onSuccess: async () => {
      // `invalidateQueries` apenas agenda a nova leitura. Se a rota muda
      // antes de `/auth/me` devolver o cookie recém-emitido, o guard ainda
      // vê o visitante em cache e manda o usuário de volta para /login.
      // Esperar a confirmação também transforma um cookie bloqueado pelo
      // navegador num erro acionável, em vez de aparentar um reload.
      //
      // Chama `fetchCurrentUser` direto (não `queryClient.fetchQuery`) --
      // achado ao vivo 2026-09-28: a própria `/login` já monta
      // `usuarioQuery` (linha acima) e dispara um `GET /auth/me` de
      // visitante ao carregar a página. Se esse fetch ainda está em voo
      // quando o login termina (autofill rápido, ou rede lenta -- Render
      // free tier), `queryClient.fetchQuery` para a MESMA `queryKey`
      // reaproveita essa promise já em andamento (dedup do TanStack
      // Query) em vez de emitir uma requisição nova -- ela resolve com o
      // cookie de ANTES do login (null), reportando "não foi possível
      // concluir a sessão" mesmo com login e cookies corretos. Chamar o
      // service direto ignora esse cache/dedup; `setQueryData` alimenta a
      // query só depois, já com o resultado confirmado.
      //
      // `cancelQueries` primeiro é necessário mesmo chamando o service
      // direto: sem isso, aquele fetch de montagem (ainda em voo, também
      // com resultado null) resolve DEPOIS do nosso `setQueryData` e
      // sobrescreve o cache de volta pra visitante -- reproduzido ao vivo
      // (Playwright local, execução isolada): o cache brilhava com o
      // usuário certo por um instante e voltava a null, derrubando de
      // volta pra /login. `cancelQueries` marca esse fetch pendente como
      // obsoleto pro TanStack Query, que descarta a resolução dele.
      await queryClient.cancelQueries({ queryKey: monitoramentoKeys.currentUser });
      const usuario = await fetchCurrentUser();
      if (usuario === null) {
        throw new ApiError(
          "Login respondeu sem uma sessão que pudesse ser confirmada.",
          401,
          "Não foi possível concluir a sessão. Verifique se o navegador permite cookies para o SIGEO e tente novamente.",
        );
      }
      queryClient.setQueryData(monitoramentoKeys.currentUser, usuario);
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
      usuarioAtual?.role === "admin" ||
      usuarioAtual?.role === "gestor" ||
      usuarioAtual?.role === "colaborador",
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
