/** Limita também a espera por I/O que não respeita AbortSignal. */
export class HttpTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`A solicitação excedeu ${timeoutMs / 1000} segundos.`);
    this.name = "HttpTimeoutError";
  }
}

export class HttpCanceladoError extends Error {
  constructor() {
    super("Solicitação cancelada pelo chamador.");
    this.name = "HttpCanceladoError";
  }
}

export async function executarHttpComPrazo<T>(
  operacao: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("O prazo HTTP deve ser positivo e finito.");
  }
  if (signal?.aborted) throw new HttpCanceladoError();
  const controller = new AbortController();
  let interromper!: (erro: Error) => void;
  const interrupcao = new Promise<never>((_, reject) => {
    interromper = reject;
  });
  const cancelar = () => {
    interromper(new HttpCanceladoError());
    controller.abort();
  };
  const timeout = globalThis.setTimeout(() => {
    interromper(new HttpTimeoutError(timeoutMs));
    controller.abort();
  }, timeoutMs);
  signal?.addEventListener("abort", cancelar, { once: true });
  try {
    let resposta: Promise<T>;
    try {
      resposta = operacao(controller.signal);
    } catch (erro) {
      resposta = Promise.reject(erro);
    }
    return await Promise.race([resposta, interrupcao]);
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener("abort", cancelar);
  }
}
