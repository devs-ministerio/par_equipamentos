import type { ReactNode } from "react";
import { ErrorAlert } from "@/components/common/error-alert";
import { Skeleton } from "@/components/ui/skeleton";

export function DadosOficiaisInstrumentos({
  carregando,
  children,
  erro,
  onRetry,
}: {
  carregando: boolean;
  children: ReactNode;
  erro?: string | null;
  onRetry?: () => void;
}) {
  if (erro) return <ErrorAlert mensagem={erro} onRetry={onRetry} />;
  if (carregando)
    return (
      <div
        role="status"
        aria-label="Carregando instrumentos"
        className="space-y-3"
      >
        <p className="text-muted-foreground">Carregando...</p>
        <Skeleton className="h-28 w-full" />
      </div>
    );
  return <>{children}</>;
}
