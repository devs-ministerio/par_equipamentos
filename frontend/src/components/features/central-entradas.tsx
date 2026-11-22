import { DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CandidatosLegados } from "./candidatos-legados";
import { MonitorDescobertaLegado } from "./monitor-descoberta-legado";

export function CentralEntradas() {
  return (
    <>
      <header className="shrink-0 border-b border-border px-5 py-5 pr-12 sm:px-6">
        <DialogTitle className="font-display text-xl font-bold tracking-tight">
          Radar de instrumentos
        </DialogTitle>
        <DialogDescription className="mt-1">
          Triagem de convênios novos.
        </DialogDescription>
      </header>
      <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain px-5 sm:px-6">
        <MonitorDescobertaLegado fonte="siconv_descoberta" />
        <CandidatosLegados />
      </div>
    </>
  );
}
