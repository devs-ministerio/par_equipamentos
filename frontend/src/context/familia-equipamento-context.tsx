import { createContext, useContext, useState, useMemo } from 'react';
import type { ReactNode } from 'react';
import { EQUIPAMENTOS } from '../data/constants';

// Exportada pro PainelGeralPage conseguir "pre-selecionar" a familia (mesma
// chave) antes de navegar pro Dashboard, sem duplicar a string em outro
// arquivo (regressao boba: uma cópia divergente aqui silenciosamente para de
// funcionar e ninguem percebe, porque o fallback pra EQUIPAMENTOS[0] esconde
// o erro).
export const CHAVE_STORAGE_FAMILIA = 'sigeo:familiaSelecionada';
const CHAVE_STORAGE = CHAVE_STORAGE_FAMILIA;

interface FamiliaEquipamentoContextValue {
  familia: string;
  setFamilia: (familia: string) => void;
}

const FamiliaEquipamentoContext = createContext<FamiliaEquipamentoContextValue | null>(null);

function familiaInicial(): string {
  try {
    const salva = localStorage.getItem(CHAVE_STORAGE);
    if (salva && EQUIPAMENTOS.some((eq) => eq.familia === salva && eq.disponivel)) return salva;
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
export function FamiliaEquipamentoProvider({ children }: { children: ReactNode }) {
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

  return <FamiliaEquipamentoContext.Provider value={value}>{children}</FamiliaEquipamentoContext.Provider>;
}

export function useFamiliaEquipamento(): FamiliaEquipamentoContextValue {
  const ctx = useContext(FamiliaEquipamentoContext);
  if (!ctx) throw new Error('useFamiliaEquipamento precisa estar dentro de FamiliaEquipamentoProvider');
  return ctx;
}
