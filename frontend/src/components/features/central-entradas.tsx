import { DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CandidatosLegados } from "./candidatos-legados";
import { MonitorDescobertaLegado } from "./monitor-descoberta-legado";
import { Tabs } from "radix-ui";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { NAV_ITEM_CLASS } from "@/lib/navigation-styles";

const PropostasEmTramitacao = lazy(() =>
  import("./secao-propostas-candidatas").then((m) => ({
    default: m.SecaoPropostasCandidatas,
  })),
);

export function CentralEntradas() {
  return (
    <>
      <header className="shrink-0 border-b border-border px-5 py-5 pr-12 sm:px-6">
        <DialogTitle className="font-display text-xl font-bold tracking-tight">
          Radar de instrumentos
        </DialogTitle>
        <DialogDescription className="mt-1">
          Convênios para revisão e propostas em tramitação
        </DialogDescription>
      </header>
      <Tabs.Root defaultValue="legados" className="flex min-h-0 flex-col">
        <Tabs.List
          aria-label="Origem dos instrumentos"
          className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)] gap-1 border-b border-border px-5 py-3 sm:flex sm:px-6"
        >
          {[
            ["legados", "Convênios"],
            ["propostas", "Propostas em tramitação"],
          ].map(([valor, rotulo]) => (
            <Tabs.Trigger
              key={valor}
              value={valor}
              disabled={valor === "propostas"}
              title={
                valor === "propostas"
                  ? "Aguardando definição do critério de propostas novas"
                  : undefined
              }
              className={`${NAV_ITEM_CLASS} min-h-11 min-w-0 justify-center text-center text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 data-[state=active]:bg-secondary data-[state=active]:font-semibold data-[state=active]:text-primary sm:min-h-8`}
            >
              {rotulo}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain px-5 sm:px-6">
          <Tabs.Content value="legados" className="outline-none">
            <MonitorDescobertaLegado fonte="siconv_descoberta" />
            <CandidatosLegados />
          </Tabs.Content>
          <Tabs.Content value="propostas" className="min-w-0 outline-none">
            <MonitorDescobertaLegado fonte="transferegov_descoberta" />
            <Suspense fallback={<Skeleton className="my-4 h-24 w-full" />}>
              <PropostasEmTramitacao modo="tramitacao" />
            </Suspense>
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </>
  );
}
