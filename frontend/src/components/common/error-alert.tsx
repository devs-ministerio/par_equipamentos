import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Alert + "Tentar novamente" (Seção 12 da constituição) -- estado de erro
 * padrão pra qualquer `useQuery` com `onRetry` (normalmente `query.refetch`).
 * `mensagem` deve ser a mensagem SEGURA pro usuário (`ApiError` já
 * normaliza isso na camada de service), nunca stack trace/SQL/path cru. */
export function ErrorAlert({
  mensagem,
  onRetry,
}: {
  mensagem: string;
  onRetry?: () => void;
}) {
  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertTitle>Não foi possível carregar os dados</AlertTitle>
      <AlertDescription>
        {mensagem}
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2.5 w-fit"
            onClick={onRetry}
          >
            Tentar novamente
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
