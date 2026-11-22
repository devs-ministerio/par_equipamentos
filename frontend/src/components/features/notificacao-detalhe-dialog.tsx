import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fmtDataHora } from "@/lib/monitoramento-format";
import { ROTULOS_NOTIFICACAO } from "@/lib/notificacao-rotulos";
import type { Notificacao } from "@/services/notificacoes";

/** Avisos antigos vêm numa linha só, separados por "; "; os novos já vêm em linhas. */
function blocos(corpo: string): string[][] {
  const texto = corpo.includes("\n") ? corpo : corpo.replaceAll("; ", "\n");
  return texto
    .split(/\n{2,}/)
    .map((bloco) => bloco.split("\n").filter((linha) => linha.trim() !== ""))
    .filter((linhas) => linhas.length > 0);
}

export function NotificacaoDetalheDialog({
  aviso,
  fechar,
  irParaRegistro,
}: {
  aviso: Notificacao | null;
  fechar: () => void;
  irParaRegistro: (destino: string) => void;
}) {
  return (
    <Dialog
      open={aviso !== null}
      onOpenChange={(aberto) => !aberto && fechar()}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        {aviso && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-lg font-bold tracking-tight">
                {aviso.titulo}
              </DialogTitle>
              <DialogDescription>
                {ROTULOS_NOTIFICACAO[aviso.tipo]} ·{" "}
                <time dateTime={aviso.created_at}>
                  {fmtDataHora(aviso.created_at)} (Brasília)
                </time>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm leading-relaxed [overflow-wrap:anywhere]">
              {blocos(aviso.corpo ?? "").map((linhas, i) => (
                <div key={i} className="space-y-1">
                  {linhas.map((linha, j) => (
                    <p
                      key={j}
                      className={
                        j === 0 && !linha.startsWith("•")
                          ? "font-medium text-foreground"
                          : "text-muted-foreground"
                      }
                    >
                      {linha}
                    </p>
                  ))}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
              {aviso.destino && (
                <Button
                  size="sm"
                  onClick={() => irParaRegistro(aviso.destino as string)}
                >
                  Abrir instrumento
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={fechar}>
                Fechar
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
