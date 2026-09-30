import { Link } from "react-router-dom";
import { ArrowUpRight, CalendarClock } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { fmtData } from "@/lib/monitoramento-format";

interface VigenciaProxima {
  nr_convenio: string;
  nome_convenente: string;
  data_final: string;
  dias: number;
}

export function MonitoramentoPainelVigencias({
  vigencias,
}: {
  vigencias: VigenciaProxima[];
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="group mt-7 flex w-full cursor-pointer items-center justify-between gap-4 border border-border border-l-[3px] border-l-warning bg-card px-5 py-5 text-left transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-6"
        >
          <span className="min-w-0">
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-warning uppercase">
              <CalendarClock aria-hidden="true" className="size-4" />
              Vigência contratual
            </span>
            <strong className="mt-2 block font-display text-lg font-semibold leading-tight tracking-tight text-foreground sm:text-xl">
              Instrumentos com vigência a encerrar
            </strong>
            <span className="mt-1 block text-xs text-muted-foreground">
              Próximos 90 dias · selecione para consultar os instrumentos
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-3 sm:gap-5">
            <span className="font-display text-4xl font-semibold tracking-tight tabular-nums text-warning">
              {vigencias.length}
            </span>
            <ArrowUpRight
              aria-hidden="true"
              className="size-5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
            />
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[min(85vh,780px)] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border bg-muted/25 px-5 py-5 text-left sm:px-6">
          <DialogTitle className="font-display text-xl tracking-tight">
            Vigências a encerrar
          </DialogTitle>
          <DialogDescription>
            {vigencias.length} instrumentos com prazo nos próximos 90 dias no
            recorte selecionado.
          </DialogDescription>
        </DialogHeader>
        {vigencias.length ? (
          <div className="max-h-[min(60vh,540px)] divide-y divide-border overflow-y-auto px-5 sm:px-6">
            {vigencias.map((item) => (
              <DialogClose key={item.nr_convenio} asChild>
                <Link
                  to={`/monitoramento-equipamentos/instrumentos/${encodeURIComponent(item.nr_convenio)}`}
                  className="group flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1 py-3 text-sm hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="min-w-0">
                    <strong className="block font-semibold text-foreground group-hover:text-primary">
                      {item.nome_convenente}
                    </strong>
                    <span className="font-data text-xs text-muted-foreground">
                      {item.nr_convenio}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-warning">
                    {fmtData(item.data_final)} ·{" "}
                    {item.dias === 0 ? "vence hoje" : `em ${item.dias} dias`}
                  </span>
                </Link>
              </DialogClose>
            ))}
          </div>
        ) : (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">
            Nenhuma vigência com encerramento nos próximos 90 dias neste
            recorte.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
