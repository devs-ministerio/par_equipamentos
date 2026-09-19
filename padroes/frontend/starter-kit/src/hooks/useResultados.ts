/**
 * hooks/useResultados.ts
 *
 * Toda lógica assíncrona fica em hook (Seção 7) — retorna estado, loading,
 * error e ações. Componente só consome, nunca chama service direto.
 */

import { useEffect, useState } from "react";
import { getResultados } from "@/services/resultados";
import type { Resultado } from "@/types/resultado";
import type { ApiError } from "@/lib/errors";

type State = {
  data: Resultado[];
  loading: boolean;
  error: ApiError | null;
};

export function useResultados() {
  const [state, setState] = useState<State>({ data: [], loading: true, error: null });

  async function load() {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await getResultados();
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState({ data: [], loading: false, error: error as ApiError });
    }
  }

  useEffect(() => {
    load();
  }, []);

  return { ...state, refetch: load };
}
