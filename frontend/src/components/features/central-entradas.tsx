import { DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CandidatosLegados } from "./candidatos-legados";
import { MonitorDescobertaLegado } from "./monitor-descoberta-legado";
import { Tabs } from "radix-ui";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

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
          className="flex shrink-0 gap-4 border-b border-border px-5 sm:px-6"
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
              className="min-w-0 border-b-2 border-transparent py-3 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 data-[state=active]:border-primary data-[state=active]:font-semibold data-[state=active]:text-primary"
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
