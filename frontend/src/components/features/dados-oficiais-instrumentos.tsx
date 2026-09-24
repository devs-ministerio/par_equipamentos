import type { ReactNode } from "react";

export function DadosOficiaisInstrumentos({
  carregando,
  children,
}: {
  carregando: boolean;
  children: ReactNode;
}) {
  if (carregando) return <p className="text-muted-foreground">Carregando...</p>;
  return <>{children}</>;
}
