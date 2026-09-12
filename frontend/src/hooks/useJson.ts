import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-error';

async function buscarJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new ApiError(`Falha de rede ao consultar ${url}: ${(e as Error).message}`);
  }
  if (!res.ok) throw new ApiError(`Falha ao consultar ${url}: HTTP ${res.status}`, res.status);
  return res.json() as Promise<T>;
}

/** Busca um JSON estatico de public/ -- as 3 fontes (Portal/SICONV/
 * TransfereGov) sao pre-processadas por backend/scripts/coletar_*.py, sem
 * chamada de API a partir do frontend (ver README em
 * public/monitoramento-equipamentos/). Migrado pra `useQuery` (Parte C da
 * migração, 2026-09-11) -- mesma interface `{ dados, erro }` de antes pra
 * não obrigar reescrever os ~5 call sites, só troca o motor por baixo
 * (cancelamento de corrida nativo do Query em vez de guarda manual). */
export function useJson<T>(url: string) {
  const query = useQuery({
    queryKey: ['json-estatico', url],
    queryFn: () => buscarJson<T>(url),
    staleTime: 5 * 60_000,
  });
  return {
    dados: query.data ?? null,
    erro: query.error ? String(query.error) : null,
  };
}
