import type { z } from "zod";
import { requisitar } from "@/lib/http-client";

/** Ao contrário de `services/api.ts`, o formato de domínio dos services de
 * `monitoramento-*.ts`/`notificacoes.ts`/`propostas-candidatas.ts` continua
 * snake_case (não vira camelCase) -- decisão deliberada: os forms/telas que
 * consomem esses tipos (MonitoramentoInterno, overview/painel) já usavam
 * esse formato extensamente, e não mudar comportamento observável pesou
 * mais que a convenção de nomenclatura. */

export function apiGet<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  return requisitar(path, schema, undefined);
}

/** Alias documental de `apiGet` -- usado pelas leituras que exigem sessão
 * (Bloco 1). Mecanicamente igual a `apiGet` desde o Bloco 2 (o cookie já
 * vai em toda chamada, autenticada ou não); mantido como nome próprio só
 * pra marcar no código quem depende de sessão vs. quem é público por
 * decisão (ex. `fetchMarcos`). */
export function apiGetAuthed<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<T> {
  return requisitar(path, schema, undefined);
}

export function apiAuthed<T>(
  path: string,
  schema: z.ZodType<T>,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  return requisitar(path, schema, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
