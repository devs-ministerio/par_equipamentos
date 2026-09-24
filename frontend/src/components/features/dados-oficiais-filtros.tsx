import type { ReactNode } from "react";
import { FilterWorkspace } from "@/components/common/filter-workspace";

export function DadosOficiaisFiltros({
  ativos,
  onLimpar,
  contagem,
  children,
}: {
  ativos: boolean;
  onLimpar: () => void;
  contagem: string;
  children: ReactNode;
}) {
  return (
    <FilterWorkspace
      hasAnyFilter={ativos}
      onClear={onLimpar}
      contagem={contagem}
    >
      {children}
    </FilterWorkspace>
  );
}
