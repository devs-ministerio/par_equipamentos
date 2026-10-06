/** Token de uso único dos links de ativação/redefinição de senha.
 *
 * O link chega com o token no fragmento (`/ativar#token=...`), que a página
 * remove da barra de endereço logo ao abrir (não fica no histórico nem é
 * copiado por engano). Antes disso o token só existia na memória da página:
 * um F5 perdia o token e a tela acusava "link inválido". Agora ele também
 * fica no `sessionStorage` desta aba -- sobrevive ao recarregamento, some
 * ao fechar a aba e é apagado assim que a senha é salva. */
type ModoConta = "activate" | "reset";

const chave = (modo: ModoConta) => `sigeo_token_conta_${modo}`;

function tokenDoFragmento(hash: string): string {
  return new URLSearchParams(hash.replace(/^#/, "")).get("token")?.trim() ?? "";
}

/** Token do link (fragmento) ou, após recarregar a página, o guardado nesta
 * aba. Quando o fragmento traz um token, ele substitui o guardado. */
export function resolverTokenConta(modo: ModoConta, hash: string): string {
  const doLink = tokenDoFragmento(hash);
  try {
    if (doLink) {
      sessionStorage.setItem(chave(modo), doLink);
      return doLink;
    }
    return sessionStorage.getItem(chave(modo)) ?? "";
  } catch {
    // Storage bloqueado: funciona como antes (só o token do link).
    return doLink;
  }
}

export function limparTokenConta(modo: ModoConta): void {
  try {
    sessionStorage.removeItem(chave(modo));
  } catch {
    // idem
  }
}
