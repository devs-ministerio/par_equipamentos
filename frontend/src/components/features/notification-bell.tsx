import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { fmtData } from '@/lib/monitoramento-format';
import { useNotificacoes } from '@/hooks/use-notificacoes';
import type { Notificacao } from '@/services/notificacoes';

/** Sino de notificação do Radar de Convênios (docs/arquitetura/
 * fluxo_requisicao.md) -- 3 tipos misturados na mesma lista
 * (proposta_candidata/atualizacao_api/edicao_manual), sem filtro por role
 * ainda (RBAC/`nivel_minimo` pendente, decisão do usuário 2026-09-15:
 * "ainda vamos definir"). Fica escondido pra visitante anônimo (useNotificacoes
 * só busca com token) em vez de mostrar um sino que sempre 401. */
const RÓTULO_TIPO: Record<Notificacao['tipo'], string> = {
  proposta_candidata: 'Proposta nova',
  atualizacao_api: 'Atualização',
  edicao_manual: 'Edição manual',
};

export function NotificationBell() {
  const { notificacoes, naoLidas, carregando, marcarLida, habilitado } = useNotificacoes();
  const navigate = useNavigate();

  async function abrirNotificacao(notificacao: Notificacao) {
    if (!notificacao.lida) await marcarLida(notificacao.id);
    if (notificacao.destino) navigate(notificacao.destino);
  }

  if (!habilitado) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={naoLidas > 0 ? `Notificações (${naoLidas} não lida${naoLidas > 1 ? 's' : ''})` : 'Notificações'}
        >
          <Bell className="size-4.5" />
          {naoLidas > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4.5 min-w-4.5 justify-center rounded-full px-1 text-[10px] tabular-nums"
            >
              {naoLidas > 99 ? '99+' : naoLidas}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-90 p-0">
        <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
          <span className="text-sm font-bold text-foreground">Notificações</span>
          {naoLidas > 0 && <span className="text-xs text-muted-foreground">{naoLidas} não lida{naoLidas > 1 ? 's' : ''}</span>}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {carregando ? (
            <p className="p-4 text-xs text-muted-foreground">Carregando...</p>
          ) : notificacoes.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">Nenhuma notificação por enquanto.</p>
          ) : (
            notificacoes.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => void abrirNotificacao(n)}
                className={cn(
                  'block w-full border-b border-border px-3.5 py-2.5 text-left last:border-b-0 hover:bg-muted',
                  !n.lida && 'bg-secondary/40',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-bold text-foreground">{n.titulo}</span>
                  {!n.lida && <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
                </div>
                {n.corpo && <p className="mt-0.5 text-xs text-muted-foreground">{n.corpo}</p>}
                <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-muted-foreground/70">
                  <span>{RÓTULO_TIPO[n.tipo]}</span>
                  <span aria-hidden="true">·</span>
                  <span>{fmtData(n.created_at)}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
