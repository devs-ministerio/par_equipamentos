import { type ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONTAINER_CLASS } from "@/lib/layout";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { UserMenu } from "./user-menu";

export interface HeaderNavItem {
  path: string;
  label: string;
  /** Default: `location.pathname.startsWith(path)`. Sobrescrever quando a
   * rota ativa precisa de regra diferente (ex.: rota-mãe cobrindo uma
   * sub-rota de detalhe que não é prefixo simples). */
  isActive?: (pathname: string) => boolean;
}

function NavButton({
  item,
  active,
  onNavigate,
  className,
}: {
  item: HeaderNavItem;
  active: boolean;
  onNavigate: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        active
          ? "bg-secondary font-semibold text-primary"
          : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {item.label}
    </button>
  );
}

/** Header unificado: logo + nome do app + navegação numa barra só. Aba ativa
 * é pill preenchida (bg-secondary + texto primary), não borda inferior --
 * decisão deliberada, mantida mesmo a Seção 5 da constituicao_frontend.md
 * preferir borda.
 *
 * `leftExtra` é o slot pro SeletorEquipamento (AppLayout); `rightExtra`,
 * pro NotificationBell (MonitoramentoLayout). No mobile ambos permanecem no
 * cabeçalho, acessíveis sem abrir o painel lateral.
 *
 * Abaixo de `lg` (1024px) nav/leftExtra/rightExtra/UserMenu colapsam num
 * menu mobile (Sheet) atrás de um botão hambúrguer -- Radix Dialog já
 * fecha com Escape e devolve foco ao trigger, sem código extra aqui. */
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
  const [menuAberto, setMenuAberto] = useState(false);

  function irPara(path: string) {
    navigate(path);
    setMenuAberto(false);
  }

  return (
    <header className="border-b border-border bg-card">
      <div
        className={cn(
          CONTAINER_CLASS,
          "flex h-14 items-center justify-between gap-4",
        )}
      >
        <div className="flex min-w-0 items-center gap-4">
          {/* A marca leva à entrada operacional definida para o sistema. */}
          <Link
            to="/monitoramento-equipamentos"
            className="flex shrink-0 items-center gap-2.5 text-foreground"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary font-display text-sm font-bold text-primary-foreground">
              S
            </span>
            <span className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="font-display text-[15px] font-bold tracking-tight">
                SIGEO
              </span>
              <span className="h-3.5 w-px bg-border" aria-hidden="true" />
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Gestão de Equipamentos em Oncologia
              </span>
            </span>
          </Link>
          <div className="hidden lg:block">{leftExtra}</div>
        </div>

        {/* Desktop (>=1024px): tudo na própria barra -- em 768px o nav
            completo (4 itens + extras + UserMenu) não cabe numa linha só
            sem quebrar pra fora dos 56px do header, então tablet também
            usa o menu mobile abaixo. */}
        <div className="hidden items-center gap-2 lg:flex">
          <nav className="flex flex-wrap items-center justify-end gap-1">
            {navItems.map((item) => {
              const active = item.isActive
                ? item.isActive(location.pathname)
                : location.pathname.startsWith(item.path);
              return (
                <NavButton
                  key={item.path}
                  item={item}
                  active={active}
                  onNavigate={() => navigate(item.path)}
                />
              );
            })}
          </nav>
          {rightExtra}
          {/* UserMenu fica direto no AppHeader (não num slot) -- é usado por
              TODA página (PainelGeralPage, AppLayout, MonitoramentoLayout),
              então 1 lugar só cobre "todas as páginas no nav". */}
          <UserMenu />
        </div>

        {/* Mobile/tablet (<1024px): extras no header; navegação e conta no painel. */}
        <div className="flex shrink-0 items-center gap-1 lg:hidden">
          {leftExtra}
          {rightExtra}
          <Sheet open={menuAberto} onOpenChange={setMenuAberto}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11"
                aria-label="Abrir menu"
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              showCloseButton={false}
              className="gap-0 overflow-hidden border-l border-border"
              style={{ width: "min(100vw, 24rem)", maxWidth: "none" }}
            >
              <SheetHeader className="flex shrink-0 flex-row items-center justify-between border-b border-border px-5 py-4">
                <SheetTitle className="font-display text-xl font-semibold tracking-tight">
                  Menu
                </SheetTitle>
                <SheetClose asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="min-h-11 min-w-11"
                    aria-label="Fechar menu"
                  >
                    <X className="size-5" />
                  </Button>
                </SheetClose>
              </SheetHeader>
              <div className="min-h-0 overflow-y-auto overscroll-contain">
                <div className="px-4 py-5">
                  <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Navegação
                  </p>
                  <nav
                    aria-label="Navegação principal"
                    className="mt-3 flex flex-col gap-1"
                  >
                    {navItems.map((item) => {
                      const active = item.isActive
                        ? item.isActive(location.pathname)
                        : location.pathname.startsWith(item.path);
                      return (
                        <NavButton
                          key={item.path}
                          item={item}
                          active={active}
                          onNavigate={() => irPara(item.path)}
                          className={cn(
                            "min-h-11 w-full rounded-md border-l-[3px] px-3.5 py-2.5 text-left text-sm",
                            active ? "border-primary" : "border-transparent",
                          )}
                        />
                      );
                    })}
                  </nav>
                </div>
              </div>
              <div className="shrink-0 border-t border-border pb-[env(safe-area-inset-bottom)]">
                <UserMenu mobile onNavigate={() => setMenuAberto(false)} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
