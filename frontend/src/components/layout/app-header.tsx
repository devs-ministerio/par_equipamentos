import { type ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu } from "lucide-react";
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
        "rounded-full px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors",
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
 * `leftExtra` é o slot pro que fica entre o nome do app e a navegação --
 * hoje só o SeletorEquipamento (AppLayout). `rightExtra` fica depois da
 * navegação (hoje só o NotificationBell do MonitoramentoLayout) -- 2 slots
 * simétricos em vez de crescer a assinatura com 1 prop por widget novo.
 *
 * Abaixo de `md` (768px) nav/leftExtra/rightExtra/UserMenu colapsam num
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

        {/* Mobile (<768px): tudo colapsa atrás do hambúrguer. */}
        <Sheet open={menuAberto} onOpenChange={setMenuAberto}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Abrir menu"
            >
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[85vw] max-w-[320px]">
            <SheetHeader>
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
              {leftExtra && <div>{leftExtra}</div>}
              <nav className="flex flex-col items-stretch gap-1">
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
                      className="w-full rounded-lg py-2.5 text-left"
                    />
                  );
                })}
              </nav>
              {rightExtra}
              <SheetClose asChild>
                <div>
                  <UserMenu />
                </div>
              </SheetClose>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
