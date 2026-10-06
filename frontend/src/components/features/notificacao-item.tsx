import { Button } from "@/components/ui/button";
import { fmtData } from "@/lib/monitoramento-format";
import { ROTULOS_NOTIFICACAO } from "@/lib/notificacao-rotulos";
import { cn } from "@/lib/utils";
import type { Notificacao } from "@/services/notificacoes";

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
  return (
    <article
      className={cn(
        "border-b border-border border-l-2 p-4",
        aviso.lida
          ? "border-l-transparent"
          : "border-l-primary bg-secondary/25",
      )}
    >
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {ROTULOS_NOTIFICACAO[aviso.tipo]}
          {!aviso.lida ? " · Não lida" : ""}
        </span>
        <time dateTime={aviso.created_at}>{fmtData(aviso.created_at)}</time>
      </div>
      <h3 className="mt-2 break-words text-sm font-semibold [overflow-wrap:anywhere]">
        {aviso.titulo}
      </h3>
      {aviso.corpo && (
        <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
          {aviso.corpo.replaceAll("; ", ";\n")}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {(aviso.destino || !aviso.lida) && (
          <Button
            size="sm"
            variant="outline"
            disabled={ocupada}
            onClick={() => void abrir(aviso)}
          >
            {aviso.destino ? "Abrir registro" : "Marcar como lida"}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={ocupada}
          onClick={() => void arquivar(aviso)}
        >
          {aviso.arquivada ? "Restaurar" : "Arquivar"}
        </Button>
      </div>
    </article>
  );
}
