/**
 * services/resultados.ts
 *
 * Nenhum fetch dentro do componente (Seção 9). Todo payload é validado com
 * Zod aqui antes de retornar ao hook — resposta que falha na validação vira
 * ApiError, nunca é repassada adiante.
 */

import { resultadoListSchema, resultadoSchema } from "@/lib/validations/resultado";
import type { Resultado } from "@/types/resultado";
import { toApiError } from "@/lib/errors";

const BASE_URL = "/api/resultados";

export async function getResultados(): Promise<Resultado[]> {
  try {
    const res = await fetch(BASE_URL);
    if (!res.ok) throw new Error(`Falha ao carregar resultados (${res.status})`);
    const data = await res.json();
    return resultadoListSchema.parse(data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function getResultado(id: string): Promise<Resultado> {
  try {
    const res = await fetch(`${BASE_URL}/${id}`);
    if (!res.ok) throw new Error(`Falha ao carregar resultado (${res.status})`);
    const data = await res.json();
    return resultadoSchema.parse(data);
  } catch (error) {
    throw toApiError(error);
  }
}
