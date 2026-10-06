import { ClipboardList } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

const CentralEntradas = lazy(() =>
  import("./central-entradas").then((m) => ({ default: m.CentralEntradas })),
);

/** Acesso independente das linhas de financiamento, também em celular. */
export function CentralEntradasLink() {
  const [aberta, setAberta] = useState(false);
  return (
    <Dialog open={aberta} onOpenChange={setAberta}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Radar de instrumentos"
          title="Radar de instrumentos"
        >
          <ClipboardList className="size-4.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw_-_2.25rem)] flex-col gap-0 p-0 sm:max-w-3xl!">
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
