/**
 * lib/errors.ts
 *
 * Erro normalizado de service (Seção 9 da constiuicao_frontend.md).
 * Todo service lança ApiError no catch — nunca deixa o erro cru do
 * fetch/axios/Zod subir direto para o hook/UI.
 */

export class ApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof Error) return new ApiError(error.message);
  return new ApiError("Erro inesperado");
}
