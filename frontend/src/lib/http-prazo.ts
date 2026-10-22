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

export interface OpcoesPrazoHttp {
  /** Para operações que devolvem uma resposta com corpo ainda em leitura
   * (fetch): mantém o abort do chamador ligado ao sinal já entregue, mesmo
   * depois de a promessa resolver. Sem isso, nenhum listener sobra no sinal. */
  propagarAbortAposResposta?: boolean;
}

export async function executarHttpComPrazo<T>(
  operacao: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
  opcoes: OpcoesPrazoHttp = {},
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
    // Depois que a resposta chega, o corpo ainda pode estar em leitura
    // (download de arquivo). Se o chamador abortar nesse intervalo, o sinal já
    // entregue ao fetch precisa ser abortado também, ou a conexão fica aberta
    // até o servidor fechar. A rejeição já foi decidida acima; aqui só se
    // cancela a rede.
    if (opcoes.propagarAbortAposResposta && signal && !signal.aborted) {
      signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    }
  }
}
