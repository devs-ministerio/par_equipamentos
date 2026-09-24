import { useState, useMemo } from "react";
import type { ReactNode } from "react";
import { EQUIPAMENTOS } from "../data/constants";
import {
  CHAVE_STORAGE_FAMILIA,
  FamiliaEquipamentoContext,
} from "@/hooks/use-familia-equipamento";

const CHAVE_STORAGE = CHAVE_STORAGE_FAMILIA;

function familiaInicial(): string {
  try {
    const salva = localStorage.getItem(CHAVE_STORAGE);
    if (
      salva &&
      EQUIPAMENTOS.some((eq) => eq.familia === salva && eq.disponivel)
    )
      return salva;
  } catch {
    // localStorage indisponível (janela privada etc.) -- segue com o default
  }
  return EQUIPAMENTOS[0].familia;
}

/**
 * Guarda qual família de equipamento está selecionada no menu (SeletorEquipamento
 * em TopNav.tsx) -- lida por Dashboard/Mapa/Relatórios no lugar do antigo
 * `const FAMILIA = 'TOMOGRAFO'` fixo em cada página, pra trocar de família
 * realmente mudar o dado carregado nas 3 páginas de uma vez só. Persiste em
 * localStorage só como conveniência (lembrar a última escolha do navegador),
 * não é fonte de verdade compartilhada entre abas/usuários.
 */
export function FamiliaEquipamentoProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [familia, setFamiliaState] = useState<string>(familiaInicial);

  const setFamilia = (nova: string) => {
    setFamiliaState(nova);
    try {
      localStorage.setItem(CHAVE_STORAGE, nova);
    } catch {
      // ignora -- so perde a conveniencia de lembrar na proxima visita
    }
  };

  const value = useMemo(() => ({ familia, setFamilia }), [familia]);

  return (
    <FamiliaEquipamentoContext.Provider value={value}>
      {children}
    </FamiliaEquipamentoContext.Provider>
  );
}
