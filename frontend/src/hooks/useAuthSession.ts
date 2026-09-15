import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type AuthUser,
  fetchCurrentUser,
  getAuthToken,
  login,
  setAuthToken,
} from '@/services/monitoramento';
import { monitoramentoKeys } from './monitoramento-query-keys';

/** Token vive no cache do TanStack Query (não mais `useState` local) --
 * achado 2026-09-15: com o login saindo do form inline (dentro de 1
 * convênio) pra página dedicada (login-page.tsx) + widget global no header
 * (UserMenu, presente em toda página), várias instâncias de
 * `useAuthSession()` ficam montadas ao mesmo tempo (header + página).
 * `useState` local não propaga entre instâncias -- login/logout num lugar
 * não atualizava o outro (bug real visto ao testar: deslogar pelo header
 * deixava o card "Acesso operacional" da página ainda mostrando o usuário
 * antigo). `queryClient.setQueryData` nesta chave notifica TODO `useQuery`
 * inscrito nela, em qualquer componente -- vira uma store global de graça. */
const TOKEN_QUERY_KEY = ['auth', 'token'] as const;

/** Sessão do usuário operacional do monitoramento interno (login/logout +
 * usuário atual) -- extraído de MonitoramentoInterno.tsx pra hook próprio
 * (Seção 6/C da migração: lógica assíncrona nunca dentro do componente de
 * UI). */
export function useAuthSession() {
  const queryClient = useQueryClient();

  const { data: token = null } = useQuery({
    queryKey: TOKEN_QUERY_KEY,
    queryFn: () => getAuthToken(),
    initialData: () => getAuthToken(),
    staleTime: Infinity,
  });

  const usuarioQuery = useQuery({
    queryKey: [...monitoramentoKeys.currentUser, token],
    queryFn: fetchCurrentUser,
    enabled: Boolean(token),
    retry: false,
  });

  // Token ficou inválido (401) -- some da sessão sem propagar erro pra UI
  // além de "não autenticado" (mesmo comportamento do catch antigo).
  if (token && usuarioQuery.isError && !getAuthToken()) {
    queryClient.setQueryData(TOKEN_QUERY_KEY, null);
  }

  const loginMutation = useMutation({
    mutationFn: (corpo: { email: string; senha: string }) => login(corpo.email, corpo.senha),
    onSuccess: (novoToken) => {
      queryClient.setQueryData(TOKEN_QUERY_KEY, novoToken);
      queryClient.invalidateQueries({ queryKey: monitoramentoKeys.currentUser });
    },
  });

  function sair() {
    setAuthToken(null);
    queryClient.setQueryData(TOKEN_QUERY_KEY, null);
    queryClient.removeQueries({ queryKey: monitoramentoKeys.currentUser });
  }

  /** Chamado pelas mutações de escrita do módulo quando o backend recusa
   * por falta de sessão -- mesmo papel do antigo `tratarErroEscrita`. */
  function tratarSessaoInvalida() {
    if (!getAuthToken()) queryClient.setQueryData(TOKEN_QUERY_KEY, null);
  }

  const usuarioAtual: AuthUser | null = token ? (usuarioQuery.data ?? null) : null;

  return {
    usuarioAtual,
    autenticado: Boolean(usuarioAtual),
    podeEditar: usuarioAtual?.role === 'admin' || usuarioAtual?.role === 'colaborador',
    checandoSessao: Boolean(token) && usuarioQuery.isLoading,
    login: loginMutation.mutateAsync,
    loginPendente: loginMutation.isPending,
    erroLogin: loginMutation.error,
    sair,
    tratarSessaoInvalida,
  };
}
