import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtData } from "@/lib/monitoramento-format";
import { ROTULOS_NOTIFICACAO } from "@/lib/notificacao-rotulos";
import { cn } from "@/lib/utils";
import type { Notificacao } from "@/services/notificacoes";
import { estiloCard } from "./monitoramento-ui";

export function NotificacaoItem({
  aviso,
  ocupada,
  abrir,
  arquivar,
}: {
  aviso: Notificacao;
  ocupada: boolean;
  abrir: (aviso: Notificacao) => Promise<void>;
  arquivar: (aviso: Notificacao) => Promise<void>;
}) {
  const tituloId = useId();
  return (
    <article
      aria-labelledby={tituloId}
      className={cn(
        estiloCard,
        "min-w-0 border-l-[3px] [overflow-wrap:anywhere]",
        aviso.lida ? "border-l-border" : "border-l-primary",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3
          id={tituloId}
          className="min-w-0 flex-1 font-display text-base font-semibold tracking-tight"
        >
          {aviso.titulo}
        </h3>
        <Badge
          variant="outline"
          className={cn(
            "max-w-full whitespace-normal text-xs",
            !aviso.lida && "border-primary/25 bg-secondary/40 text-primary",
          )}
        >
          {aviso.arquivada ? "Arquivada" : aviso.lida ? "Lida" : "Não lida"}
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{ROTULOS_NOTIFICACAO[aviso.tipo]}</span>
        <time dateTime={aviso.created_at}>{fmtData(aviso.created_at)}</time>
      </div>
      {aviso.corpo && (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {aviso.corpo.replaceAll("; ", ";\n")}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
        {(aviso.destino || !aviso.lida) && (
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 sm:min-h-8"
            disabled={ocupada}
            onClick={() => void abrir(aviso)}
          >
            {aviso.destino ? "Abrir registro" : "Marcar como lida"}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="min-h-11 sm:min-h-8"
          disabled={ocupada}
          onClick={() => void arquivar(aviso)}
        >
          {aviso.arquivada ? "Restaurar" : "Arquivar"}
        </Button>
      </div>
    </article>
  );
}
