import { useEffect, useState, useSyncExternalStore } from "react";
import { renovarSessao } from "@/lib/http-client";
import { assinarSessao, obterExpiracaoSessao } from "@/lib/sessao-expiracao";

/** Abaixo disso a contagem muda para o tom de alerta no menu do usuário. */
export const LIMITE_ALERTA_SESSAO_MS = 2 * 60 * 1000;

/** Contagem regressiva do access token (20 min), atualizada a cada segundo.
 *
 * Zerar não desloga ninguém: o cookie de acesso expira, e a próxima chamada
 * à API renova a sessão sozinha via `/auth/refresh` (`lib/http-client.ts`).
 * Por isso a UI trata o zero como "renova na próxima ação", e o botão
 * "Renovar sessão" antecipa essa renovação.
 *
 * `ativo=false` (visitante) não liga o relógio nem tenta renovar. */
export function useTempoSessao(ativo: boolean) {
  const expiraEm = useSyncExternalStore(
    assinarSessao,
    obterExpiracaoSessao,
    () => null,
  );
  const [agora, setAgora] = useState(() => Date.now());
  const [renovando, setRenovando] = useState(false);
  const [falhouRenovacao, setFalhouRenovacao] = useState(false);

  useEffect(() => {
    if (!ativo || expiraEm === null) return;
    setAgora(Date.now());
    const intervalo = globalThis.setInterval(() => setAgora(Date.now()), 1000);
    return () => globalThis.clearInterval(intervalo);
  }, [ativo, expiraEm]);

  async function renovar() {
    setRenovando(true);
    setFalhouRenovacao(false);
    try {
      const ok = await renovarSessao();
      setFalhouRenovacao(!ok);
    } finally {
      setRenovando(false);
    }
  }

  // Sessão aberta antes desta versão (sem timestamp gravado): renova uma vez
  // para o relógio passar a ter referência. Só com usuário autenticado.
  useEffect(() => {
    if (ativo && expiraEm === null) void renovarSessao();
  }, [ativo, expiraEm]);

  const restanteMs = expiraEm === null ? null : Math.max(0, expiraEm - agora);

  return {
    /** `null` enquanto o front não sabe quando a sessão expira. */
    restanteMs,
    expirada: restanteMs === 0,
    emAlerta:
      restanteMs !== null &&
      restanteMs > 0 &&
      restanteMs <= LIMITE_ALERTA_SESSAO_MS,
    renovando,
    falhouRenovacao,
    renovar,
  };
}
