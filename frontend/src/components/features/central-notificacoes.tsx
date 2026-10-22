import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Pagination } from "@/components/common/pagination";
import { SingleSelectFilter } from "@/components/common/single-select-filter";
import { useNotificacoes } from "@/hooks/use-notificacoes";
import { mensagemSeguraDoErro } from "@/lib/api-error";
import { ROTULOS_NOTIFICACAO } from "@/lib/notificacao-rotulos";
import { NotificacaoItem } from "./notificacao-item";
import type { Notificacao, NotificacaoTipo } from "@/services/notificacoes";
import { NAV_ITEM_CLASS } from "@/lib/navigation-styles";
import { cn } from "@/lib/utils";

const TAMANHO_PAGINA = 10;
type Caixa = "recebidas" | "nao-lidas" | "arquivadas";

export function CentralNotificacoes({ fechar }: { fechar: () => void }) {
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<NotificacaoTipo | undefined>();
  const [caixa, setCaixa] = useState<Caixa>("recebidas");
  const [pagina, setPagina] = useState(1);
  const avisos = useNotificacoes({
    limit: TAMANHO_PAGINA,
    offset: (pagina - 1) * TAMANHO_PAGINA,
    busca,
    tipo,
    apenasNaoLidas: caixa === "nao-lidas",
    arquivadas: caixa === "arquivadas",
  });
  const navigate = useNavigate();

  async function abrir(aviso: Notificacao) {
    try {
      if (!aviso.lida) await avisos.marcarLida(aviso.id);
      if (
        caixa === "nao-lidas" &&
        avisos.notificacoes.length === 1 &&
        pagina > 1
      )
        setPagina(pagina - 1);
      if (aviso.destino) {
        fechar();
        navigate(aviso.destino);
      }
    } catch {
      /* A mutation apresenta o erro seguro e preserva a janela. */
    }
  }

  async function arquivar(aviso: Notificacao) {
    try {
      await avisos.arquivar({ id: aviso.id, arquivada: !aviso.arquivada });
      if (avisos.notificacoes.length === 1 && pagina > 1) setPagina(pagina - 1);
    } catch {
      /* Sem remover o aviso quando o servidor não confirmou. */
    }
  }

  return (
    <>
      <div className="shrink-0 border-b border-border px-5 py-5 pr-12 sm:px-6">
        <DialogTitle className="font-display text-xl font-bold tracking-tight">
          Central de notificações
        </DialogTitle>
        <DialogDescription className="mt-1">
          Atualizações oficiais e da equipe
        </DialogDescription>
      </div>
      <div className="shrink-0 space-y-3 border-b border-border px-5 py-3 sm:px-6">
        <div
          className="grid grid-cols-3 gap-1 sm:flex"
          aria-label="Caixas de notificações"
        >
          {(
            [
              ["recebidas", "Recebidas"],
              ["nao-lidas", "Não lidas"],
              ["arquivadas", "Arquivadas"],
            ] as const
          ).map(([valor, rotulo]) => (
            <Button
              key={valor}
              size="sm"
              variant="ghost"
              className={cn(
                NAV_ITEM_CLASS,
                "min-h-11 min-w-0 justify-center sm:min-h-8",
                caixa === valor
                  ? "bg-secondary font-semibold text-primary hover:bg-secondary"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
              aria-pressed={caixa === valor}
              onClick={() => {
                setCaixa(valor);
                setPagina(1);
              }}
            >
              {rotulo}
            </Button>
          ))}
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <Input
            aria-label="Buscar notificações"
            placeholder="Buscar instrumento, proposta ou alteração"
            maxLength={200}
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(1);
            }}
          />
          <SingleSelectFilter
            placeholder="Tipo de notificação"
            clearLabel="Todos os tipos"
            value={tipo ?? null}
            options={Object.entries(ROTULOS_NOTIFICACAO).map(
              ([value, label]) => ({ value, label }),
            )}
            onChange={(valor) => {
              setTipo(
                valor
                  ? Object.keys(ROTULOS_NOTIFICACAO).find(
                      (chave): chave is NotificacaoTipo => chave === valor,
                    )
                  : undefined,
              );
              setPagina(1);
            }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {avisos.naoLidas} não lida{avisos.naoLidas !== 1 ? "s" : ""}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={avisos.ocupada || avisos.naoLidas === 0}
            onClick={() =>
              void avisos
                .marcarTodas()
                .then(() => setPagina(1))
                .catch(() => undefined)
            }
          >
            Marcar todas como lidas
          </Button>
        </div>
      </div>
      <div
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6"
        aria-busy={avisos.carregando}
      >
        {avisos.erro ? (
          <div role="alert" className="space-y-3 p-4">
            <p>{mensagemSeguraDoErro(avisos.erro)}</p>
            <Button
              variant="outline"
              onClick={() => void avisos.tentarNovamente()}
            >
              Tentar novamente
            </Button>
          </div>
        ) : avisos.carregando ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : avisos.notificacoes.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            Nenhuma notificação neste recorte. Tente outra caixa ou ajuste a
            busca.
          </p>
        ) : (
          <ul
            aria-label="Notificações neste recorte"
            className="space-y-3 py-4"
          >
            {avisos.notificacoes.map((aviso) => (
              <li key={aviso.id}>
                <NotificacaoItem
                  aviso={aviso}
                  ocupada={avisos.ocupada}
                  abrir={abrir}
                  arquivar={arquivar}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <Pagination
        page={pagina}
        totalItems={avisos.total}
        pageSize={TAMANHO_PAGINA}
        onPageChange={setPagina}
        mobileStacked
      />
    </>
  );
}
