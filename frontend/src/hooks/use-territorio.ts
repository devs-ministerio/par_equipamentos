import { createContext, useContext } from "react";

/** Recorte territorial escolhido na Visão geral, compartilhado com Mapa e
 * Relatórios para que trocar de aba não perca a seleção. */
export interface Territorio {
  ufs: string[];
  macros: string[];
  regioesSaude: string[];
  municipios: string[];
  cnes: string[];
}

export const TERRITORIO_VAZIO: Territorio = {
  ufs: [],
  macros: [],
  regioesSaude: [],
  municipios: [],
  cnes: [],
};

export interface TerritorioContextValue {
  territorio: Territorio;
  setTerritorio: (territorio: Territorio) => void;
}

// Sem provider (testes isolados), age como contexto vazio e sem efeito.
export const TerritorioContext = createContext<TerritorioContextValue>({
  territorio: TERRITORIO_VAZIO,
  setTerritorio: () => {},
});

export function useTerritorio(): TerritorioContextValue {
  return useContext(TerritorioContext);
}
