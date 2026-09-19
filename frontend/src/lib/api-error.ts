/** Erro normalizado da camada de services (Seção 9 da constiuicao_frontend.md
 * anexada pelo usuário) -- nenhum service deixa erro cru subir pra UI, tudo
 * vira `ApiError` no catch antes de retornar. `status` é o HTTP status
 * quando disponível (resposta não-ok); ausente pra falha de rede/parse.
 *
 * `message` (herdado de `Error`) guarda o detalhe TÉCNICO completo -- inclui
 * path da API, nome do schema Zod que falhou, mensagem crua de falha de
 * rede -- útil pra log/console, nunca pra UI. `publicMessage` é a mensagem
 * SEGURA pra exibir ao usuário (Seção 17 da constituição: "mensagem de erro
 * exibida ao usuário nunca repassa detalhe técnico cru vindo da API").
 * Quando o backend já devolve um `detail`/`error` de domínio (uma rota
 * `4xx` respondida, não uma falha de rede/schema), `publicMessage` é esse
 * mesmo texto -- o backend já garante que não vaza stack trace/SQL/path de
 * servidor nesse campo (Plan Mode segurança 2026-09-16, Bloco 1). Só falha
 * de rede/schema (nunca alcançou uma resposta de domínio de verdade) cai no
 * fallback genérico. */
export class ApiError extends Error {
  status?: number;
  publicMessage: string;

  constructor(message: string, status?: number, publicMessage?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.publicMessage = publicMessage ?? 'Não foi possível completar a operação. Tente novamente em instantes.';
  }
}

/** Mensagem segura pra exibir ao usuário -- usar em toda `ErrorAlert`/texto
 * de erro visível, nunca `error.message`/`String(error)` direto. */
export function mensagemSeguraDoErro(erro: unknown): string {
  if (erro instanceof ApiError) return erro.publicMessage;
  return 'Não foi possível completar a operação. Tente novamente em instantes.';
}
