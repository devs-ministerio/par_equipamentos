import { Bell } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CentralNotificacoes } from "./central-notificacoes";
import { ROTULOS_NOTIFICACAO } from "@/lib/notificacao-rotulos";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { fmtData } from "@/lib/monitoramento-format";
import { useNotificacoes } from "@/hooks/use-notificacoes";
import type { Notificacao } from "@/services/notificacoes";

/** Sino de notificação (docs/arquitetura/
 * planmode-notificacoes-escopo-2026-09-25.md) -- 4 tipos misturados na mesma
 * lista (proposta_candidata/atualizacao_api/edicao_manual/alerta_vigencia).
 * Escopo por destinatário resolvido no backend (titular/suplente do
 * instrumento + gestor/admin sempre; broadcast quando não há monitoramento
 * interno; leitor nunca recebe) -- este componente só lista o que
 * `GET /notificacoes` já devolveu escopado, sem filtro adicional aqui. Fica
 * escondido pra visitante anônimo (useNotificacoes só busca com token) em
 * vez de mostrar um sino que sempre 401. */
const RÓTULO_TIPO = ROTULOS_NOTIFICACAO;

export function NotificationBell() {
  const [centralAberta, setCentralAberta] = useState(false);
  const [resumoAberto, setResumoAberto] = useState(false);
  const { notificacoes, naoLidas, carregando, marcarLida, habilitado, erro } =
    useNotificacoes();
  const navigate = useNavigate();

  async function abrirNotificacao(notificacao: Notificacao) {
    try {
      if (!notificacao.lida) await marcarLida(notificacao.id);
      if (notificacao.destino) {
        setResumoAberto(false);
        navigate(notificacao.destino);
      }
    } catch {
      /* A mutation exibe o erro seguro. */
    }
  }

  if (!habilitado) return null;

  return (
    <>
      <Popover open={resumoAberto} onOpenChange={setResumoAberto}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative max-lg:min-h-11 max-lg:min-w-11"
            aria-label={
              naoLidas > 0
                ? `Notificações (${naoLidas} não lida${naoLidas > 1 ? "s" : ""})`
                : "Notificações"
            }
          >
            <Bell className="size-4.5" />
            {naoLidas > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-4.5 min-w-4.5 justify-center rounded-full px-1 text-[10px] tabular-nums"
              >
                {naoLidas > 99 ? "99+" : naoLidas}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          collisionPadding={16}
          className="w-[min(calc(100vw-2rem),22.5rem)] p-0"
        >
          <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
            <span className="text-sm font-bold text-foreground">
              Notificações
            </span>
            {naoLidas > 0 && (
              <span className="text-xs text-muted-foreground">
                {naoLidas} não lida{naoLidas > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {erro ? (
              <p role="alert" className="p-4 text-xs">
                Não foi possível carregar. Abra a central para tentar novamente.
              </p>
            ) : carregando ? (
              <p className="p-4 text-xs text-muted-foreground">Carregando...</p>
            ) : notificacoes.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground">
                Nenhuma notificação por enquanto.
              </p>
            ) : (
              notificacoes.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => void abrirNotificacao(n)}
                  className={cn(
                    "block w-full break-words border-b border-border px-3.5 py-2.5 text-left last:border-b-0 hover:bg-muted [overflow-wrap:anywhere]",
                    !n.lida && "bg-secondary/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-bold text-foreground">
                      {n.titulo}
                    </span>
                    {!n.lida && (
                      <span
                        className="mt-1 size-1.5 shrink-0 rounded-full bg-primary"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  {n.corpo && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {n.corpo}
                    </p>
                  )}
                  <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-muted-foreground/70">
                    <span>{RÓTULO_TIPO[n.tipo]}</span>
                    <span aria-hidden="true">·</span>
                    <span>{fmtData(n.created_at)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="border-t border-border p-3">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setResumoAberto(false);
                setCentralAberta(true);
              }}
            >
              Ver todas as notificações
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <Dialog open={centralAberta} onOpenChange={setCentralAberta}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw_-_2.25rem)] flex-col gap-0 p-0 sm:max-w-3xl!">
          <CentralNotificacoes fechar={() => setCentralAberta(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
