/** Relógio da sessão exibido no menu do usuário (contagem regressiva).
 *
 * O cookie de acesso é HttpOnly, então o JS não consegue ler o `exp` do JWT.
 * O front anota o instante em que o backend emitiu um par novo de cookies
 * (login, ativação, redefinição de senha ou `/auth/refresh`) e soma a
 * duração do access token. Nada sensível é guardado: só um timestamp, sem
 * token nem dado do usuário.
 *
 * `localStorage` (e não estado React) porque a renovação feita numa aba
 * precisa aparecer nas outras (evento `storage`) e sobreviver ao F5.
 * Indisponível (janela privada, storage bloqueado) → o relógio fica
 * "desconhecido" e a UI esconde a contagem, sem quebrar nada. */

/** Espelho de `ACCESS_TOKEN_EXPIRE_MINUTES` do backend
 * (`backend/app/config.py::access_token_expire_minutes`, default 60).
 * Se o backend mudar esse valor, mudar aqui também. */
export const DURACAO_SESSAO_MS = 60 * 60 * 1000;

const CHAVE = "sigeo_sessao_emitida_em";

type Ouvinte = () => void;
const ouvintes = new Set<Ouvinte>();

function avisar(): void {
  ouvintes.forEach((ouvinte) => ouvinte());
}

function ler(): number | null {
  try {
    const bruto = globalThis.localStorage?.getItem(CHAVE);
    if (!bruto) return null;
    const valor = Number(bruto);
    return Number.isFinite(valor) ? valor : null;
  } catch {
    return null;
  }
}

/** Chamado sempre que o backend responde com cookies de sessão novos. */
export function registrarEmissaoSessao(agora: number = Date.now()): void {
  try {
    globalThis.localStorage?.setItem(CHAVE, String(agora));
  } catch {
    // Storage indisponível: a contagem só não é exibida.
  }
  avisar();
}

/** Chamado no logout. */
export function limparEmissaoSessao(): void {
  try {
    globalThis.localStorage?.removeItem(CHAVE);
  } catch {
    // idem
  }
  avisar();
}

/** Instante (epoch ms) em que o access token atual expira, ou `null` quando
 * o front não sabe (sessão aberta antes desta versão, storage bloqueado). */
export function obterExpiracaoSessao(): number | null {
  const emitidaEm = ler();
  return emitidaEm === null ? null : emitidaEm + DURACAO_SESSAO_MS;
}

/** Assinatura para `useSyncExternalStore`: mudanças nesta aba (ouvintes
 * locais) e em outras abas (evento `storage`). */
export function assinarSessao(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  const aoMudarStorage = (evento: StorageEvent) => {
    if (evento.key === CHAVE || evento.key === null) ouvinte();
  };
  globalThis.addEventListener?.("storage", aoMudarStorage);
  return () => {
    ouvintes.delete(ouvinte);
    globalThis.removeEventListener?.("storage", aoMudarStorage);
  };
}

/** "18:42", ou "1:05:09" acima de uma hora. Negativo vira "00:00". */
export function formatarTempoRestante(ms: number): string {
  const totalSeg = Math.max(0, Math.ceil(ms / 1000));
  const horas = Math.floor(totalSeg / 3600);
  const minutos = Math.floor((totalSeg % 3600) / 60);
  const segundos = totalSeg % 60;
  const mm = String(minutos).padStart(2, "0");
  const ss = String(segundos).padStart(2, "0");
  return horas > 0 ? `${horas}:${mm}:${ss}` : `${mm}:${ss}`;
}
