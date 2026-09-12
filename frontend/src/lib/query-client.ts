import { QueryClient } from '@tanstack/react-query';

/** Instância única do TanStack Query pro app inteiro (Parte C da migração
 * pra constituição, 2026-09-11) -- substitui o padrão manual
 * `useState`+`useEffect`+guarda `cancelado` usado até aqui em toda tela
 * que buscava dado (o cancelamento de request em voo já vem de graça do
 * Query, sem precisar reimplementar guarda de corrida por componente). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dado de cobertura/monitoramento não muda a cada segundo -- evita
      // refetch agressivo em todo foco de janela/troca de aba.
      staleTime: 30_000,
      retry: 1,
    },
  },
});
