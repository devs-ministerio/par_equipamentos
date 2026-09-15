import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { UserMenu } from './user-menu';

export interface HeaderNavItem {
  path: string;
  label: string;
  /** Default: `location.pathname.startsWith(path)`. Sobrescrever quando a
   * rota ativa precisa de regra diferente (ex.: rota-mãe cobrindo uma
   * sub-rota de detalhe que não é prefixo simples). */
  isActive?: (pathname: string) => boolean;
}

/** Header unificado: logo + nome do app + navegação numa barra só (achado
 * 2026-09-11, mockup completo anexado pelo usuário -- substitui o par
 * Header.tsx + TopNav.tsx/MonitoramentoTopNav.tsx, que empilhava 2 barras
 * separadas). Aba ativa é pill preenchida (bg-secondary + texto primary),
 * não borda inferior -- padrão literal do mockup, mesmo a Seção 5 da
 * constituicao_frontend.md preferir borda; a imagem de referência do
 * usuário tem prioridade sobre a regra genérica aqui.
 *
 * `leftExtra` é o slot pro que fica entre o nome do app e a navegação --
 * hoje só o SeletorEquipamento (AppLayout). `rightExtra` fica depois da
 * navegação (hoje só o NotificationBell do MonitoramentoLayout, Radar de
 * Convênios) -- 2 slots simétricos em vez de crescer a assinatura com 1
 * prop por widget novo. */
export function AppHeader({
  navItems,
  leftExtra,
  rightExtra,
}: {
  navItems: HeaderNavItem[];
  leftExtra?: ReactNode;
  rightExtra?: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-4 px-6">
        <div className="flex min-w-0 items-center gap-4">
          {/* Clicar na logo volta pro Painel Geral (pagina inicial, fora de
              qualquer layout) -- unica forma de sair do app sem usar o
              botao Voltar do navegador. */}
          <Link to="/" className="flex shrink-0 items-center gap-2.5 text-foreground">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary font-display text-sm font-bold text-primary-foreground">
              D
            </span>
            <span className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="font-display text-[15px] font-bold tracking-tight">DECAN</span>
              <span className="h-3.5 w-px bg-border" aria-hidden="true" />
              <span className="hidden text-xs text-muted-foreground sm:inline">Equipamentos Oncológicos</span>
            </span>
          </Link>
          {leftExtra}
        </div>
        <div className="flex items-center gap-2">
          <nav className="flex flex-wrap items-center justify-end gap-1">
            {navItems.map((item) => {
              const active = item.isActive ? item.isActive(location.pathname) : location.pathname.startsWith(item.path);
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => navigate(item.path)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-full px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors',
                    active ? 'bg-secondary font-semibold text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
          {rightExtra}
          {/* UserMenu fica direto no AppHeader (não num slot) -- é usado por
              TODA página (PainelGeralPage, AppLayout, MonitoramentoLayout),
              então 1 lugar só cobre "todas as páginas no nav". */}
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
