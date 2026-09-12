import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type AuthUser,
  fetchCurrentUser,
  getAuthToken,
  login,
  setAuthToken,
} from '@/services/monitoramento';
import { monitoramentoKeys } from './monitoramento-query-keys';

/** Sessão do usuário operacional do monitoramento interno (login/logout +
 * usuário atual) -- extraído de MonitoramentoInterno.tsx pra hook próprio
 * (Seção 6/C da migração: lógica assíncrona nunca dentro do componente de
 * UI). Token continua em localStorage (ver services/monitoramento.ts);
 * `useState` local só espelha esse valor pra saber quando refazer a query
 * de `/auth/me` -- o cancelamento de corrida em si já vem de graça do
 * `useQuery` (chave inclui o token). */
export function useAuthSession() {
  const [token, setToken] = useState(() => getAuthToken());
  const queryClient = useQueryClient();

  const usuarioQuery = useQuery({
    queryKey: [...monitoramentoKeys.currentUser, token],
    queryFn: fetchCurrentUser,
    enabled: Boolean(token),
    retry: false,
  });

  // Token ficou inválido (401) -- some da sessão sem propagar erro pra UI
  // além de "não autenticado" (mesmo comportamento do catch antigo).
  if (token && usuarioQuery.isError && !getAuthToken()) {
    setToken(null);
  }

  const loginMutation = useMutation({
    mutationFn: (corpo: { email: string; senha: string }) => login(corpo.email, corpo.senha),
    onSuccess: (novoToken) => {
      setToken(novoToken);
      queryClient.invalidateQueries({ queryKey: monitoramentoKeys.currentUser });
    },
  });

  function sair() {
    setAuthToken(null);
    setToken(null);
    queryClient.removeQueries({ queryKey: monitoramentoKeys.currentUser });
  }

  /** Chamado pelas mutações de escrita do módulo quando o backend recusa
   * por falta de sessão -- mesmo papel do antigo `tratarErroEscrita`. */
  function tratarSessaoInvalida() {
    if (!getAuthToken()) setToken(null);
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
