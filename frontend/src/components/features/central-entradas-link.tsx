import { ClipboardList } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useCandidatosLegados } from "@/hooks/use-candidatos-legados";

const CentralEntradas = lazy(() =>
  import("./central-entradas").then((m) => ({ default: m.CentralEntradas })),
);

/** Acesso independente das linhas de financiamento, também em celular. */
export function CentralEntradasLink() {
  const [aberta, setAberta] = useState(false);
  const consulta = useCandidatosLegados(true, 1, "", undefined, true);
  const quantidade = consulta.data?.novos ?? 0;
  return (
    <Dialog open={aberta} onOpenChange={setAberta}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative max-lg:min-h-11 max-lg:min-w-11"
          aria-label={
            quantidade > 0
              ? `Radar de instrumentos (${quantidade} na fila)`
              : "Radar de instrumentos"
          }
          title="Radar de instrumentos"
          data-radar-trigger=""
        >
          <ClipboardList className="size-4.5" />
          {quantidade > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4.5 min-w-4.5 justify-center rounded-full px-1 text-[10px] tabular-nums"
            >
              {quantidade > 99 ? "99+" : quantidade}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw_-_2.25rem)] flex-col gap-0 p-0 sm:max-w-3xl!"
        onCloseAutoFocus={(event) => {
          // O trigger original pode ficar oculto ao mudar desktop → celular.
          const visivel = Array.from(
            document.querySelectorAll<HTMLButtonElement>(
              "button[data-radar-trigger]",
            ),
          ).find((botao) => botao.getClientRects().length > 0);
          if (visivel) {
            event.preventDefault();
            visivel.focus();
          }
        }}
      >
        <Suspense
          fallback={
            <Skeleton
              aria-label="Carregando radar de instrumentos"
              className="m-6 h-32"
            />
          }
        >
          <CentralEntradas />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}
