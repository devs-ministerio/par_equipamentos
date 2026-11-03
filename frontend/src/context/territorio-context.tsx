import { useMemo, useState, type ReactNode } from "react";
import {
  TERRITORIO_VAZIO,
  TerritorioContext,
  type Territorio,
} from "@/hooks/use-territorio";

/** Guarda em memória o recorte territorial da Análise de mérito enquanto a
 * pessoa navega entre Visão geral, Mapa e Relatórios. */
export function TerritorioProvider({ children }: { children: ReactNode }) {
  const [territorio, setTerritorio] = useState<Territorio>(TERRITORIO_VAZIO);
  const value = useMemo(() => ({ territorio, setTerritorio }), [territorio]);
  return (
    <TerritorioContext.Provider value={value}>
      {children}
    </TerritorioContext.Provider>
  );
}
