import { Fragment } from "react";
import { fmtData } from "@/lib/monitoramento-format";
import { cn } from "@/lib/utils";
import { Secao } from "./monitoramento-ui";

export interface EventoLinhaDoTempo {
  data: string;
  titulo: string;
  detalhe?: string;
}

/** Apresentação compartilhada de eventos já comprovados e datados. */
export function LinhaDoTempoEventos({
  titulo,
  eventos,
}: {
  titulo: string;
  eventos: EventoLinhaDoTempo[];
}) {
  if (eventos.length === 0) return null;

  return (
    <Secao titulo={titulo} contagem={eventos.length}>
      <ol className="space-y-0 pl-1 sm:hidden">
        {eventos.map((evento, indice) => {
          const ultimo = indice === eventos.length - 1;
          return (
            <li key={`${evento.data}-${evento.titulo}-${indice}`} className="relative flex min-w-0 gap-3 pb-4 last:pb-0">
              {!ultimo && <span className="absolute top-7 bottom-0 left-[13px] w-px bg-border" aria-hidden="true" />}
              <span className={cn("relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold", ultimo ? "bg-success-bg text-success" : "border border-border bg-background text-muted-foreground")}>{indice + 1}</span>
              <div className="min-w-0 flex-1 pb-1">
                <div className="text-[11px] tabular-nums text-muted-foreground">{fmtData(evento.data)}</div>
                <div className="break-words text-sm font-semibold text-foreground">{evento.titulo}</div>
                {evento.detalhe && <div className="text-xs tabular-nums text-muted-foreground">{evento.detalhe}</div>}
                {ultimo && <span className="mt-1 inline-block text-[10px] font-bold uppercase tracking-wide text-success">Atual</span>}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="hidden overflow-x-auto pb-1 sm:block">
        <div className="flex min-w-full w-max items-start justify-center">
          {eventos.map((evento, indice) => {
            const ultimo = indice === eventos.length - 1;
            return (
              <Fragment key={`${evento.data}-${evento.titulo}-${indice}`}>
                <div className="flex w-[136px] shrink-0 flex-col items-center text-center">
                  <div className="text-[10.5px] whitespace-nowrap text-muted-foreground">
                    {fmtData(evento.data)}
                  </div>
                  <div
                    className={cn(
                      "my-1.5 flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                      ultimo
                        ? "bg-success-bg text-success"
                        : "bg-background border border-border text-muted-foreground",
                    )}
                  >
                    {indice + 1}
                  </div>
                  <div className="text-[11.5px] leading-tight font-semibold text-foreground">
                    {evento.titulo}
                  </div>
                  {evento.detalhe && (
                    <div className="mt-0.5 text-[10.5px] leading-tight text-muted-foreground">
                      {evento.detalhe}
                    </div>
                  )}
                  {ultimo && (
                    <span className="mt-1 text-[9px] font-bold uppercase tracking-wide text-success">
                      Atual
                    </span>
                  )}
                </div>
                {!ultimo && (
                  <div className="mt-[35px] h-px w-10 shrink-0 bg-border" />
                )}
              </Fragment>
            );
          })}
        </div>
      </div>
    </Secao>
  );
}
