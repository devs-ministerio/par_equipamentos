/** Erro normalizado da camada de services (Seção 9 da constiuicao_frontend.md
 * anexada pelo usuário) -- nenhum service deixa erro cru subir pra UI, tudo
 * vira `ApiError` no catch antes de retornar. `status` é o HTTP status
 * quando disponível (resposta não-ok); ausente pra falha de rede/parse. */
export class ApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}
