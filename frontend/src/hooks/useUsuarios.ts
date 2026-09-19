import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  atualizarUsuario,
  criarUsuario,
  fetchUsuarios,
  inativarUsuario,
  reativarUsuario,
  resetarSenhaUsuario,
  type AtualizarUsuarioInput,
  type CriarUsuarioInput,
  type FiltroUsuarios,
} from '@/services/usuarios';
import { monitoramentoKeys } from './monitoramento-query-keys';

/** Módulo de gestão de usuários (Admin, 2026-09-17) -- todo mutation
 * invalida a chave `usuarios` inteira (sem filtro) em vez de tentar
 * adivinhar qual combinação de busca/role/status a tela tinha aberta,
 * mesmo padrão de `usePropostasCandidatas`. */
export function useUsuarios(filtro: FiltroUsuarios) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: monitoramentoKeys.usuarios(filtro),
    queryFn: () => fetchUsuarios(filtro),
  });

  function invalidarLista() {
    queryClient.invalidateQueries({ queryKey: ['usuarios'] });
  }

  const criarMutation = useMutation({
    mutationFn: (corpo: CriarUsuarioInput) => criarUsuario(corpo),
    onSuccess: invalidarLista,
  });

  const atualizarMutation = useMutation({
    mutationFn: ({ id, corpo }: { id: number; corpo: AtualizarUsuarioInput }) => atualizarUsuario(id, corpo),
    onSuccess: invalidarLista,
  });

  const resetarSenhaMutation = useMutation({
    mutationFn: (id: number) => resetarSenhaUsuario(id),
  });

  const inativarMutation = useMutation({
    mutationFn: (id: number) => inativarUsuario(id),
    onSuccess: invalidarLista,
  });

  const reativarMutation = useMutation({
    mutationFn: (id: number) => reativarUsuario(id),
    onSuccess: invalidarLista,
  });

  return {
    usuarios: query.data?.itens ?? [],
    total: query.data?.total ?? 0,
    carregando: query.isLoading,
    erro: query.error,
    criar: criarMutation.mutateAsync,
    criando: criarMutation.isPending,
    erroCriar: criarMutation.error,
    atualizar: atualizarMutation.mutateAsync,
    atualizando: atualizarMutation.isPending,
    erroAtualizar: atualizarMutation.error,
    resetarSenha: resetarSenhaMutation.mutateAsync,
    resetandoSenha: resetarSenhaMutation.isPending,
    inativar: inativarMutation.mutateAsync,
    inativando: inativarMutation.isPending,
    reativar: reativarMutation.mutateAsync,
    reativando: reativarMutation.isPending,
  };
}
