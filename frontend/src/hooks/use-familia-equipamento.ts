import { createContext, useContext } from 'react';

// Exportada pro PainelGeralPage conseguir "pre-selecionar" a familia (mesma
// chave) antes de navegar pro Dashboard, sem duplicar a string em outro
// arquivo (regressao boba: uma cópia divergente aqui silenciosamente para de
// funcionar e ninguem percebe, porque o fallback pra EQUIPAMENTOS[0] esconde
// o erro).
export const CHAVE_STORAGE_FAMILIA = 'sigeo:familiaSelecionada';

export interface FamiliaEquipamentoContextValue {
  familia: string;
  setFamilia: (familia: string) => void;
}

export const FamiliaEquipamentoContext = createContext<FamiliaEquipamentoContextValue | null>(null);

export function useFamiliaEquipamento(): FamiliaEquipamentoContextValue {
  const ctx = useContext(FamiliaEquipamentoContext);
  if (!ctx) throw new Error('useFamiliaEquipamento precisa estar dentro de FamiliaEquipamentoProvider');
  return ctx;
}
