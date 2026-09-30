import {
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { type LucideIcon, Menu, X } from "lucide-react";
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
import { NotificationBell } from "@/components/features/notification-bell";

export interface HeaderNavItem {
  path: string;
  label: string;
  /** Default: `location.pathname.startsWith(path)`. Sobrescrever quando a
   * rota ativa precisa de regra diferente (ex.: rota-mãe cobrindo uma
   * sub-rota de detalhe que não é prefixo simples). */
  isActive?: (pathname: string) => boolean;
  /** Ícone decorativo à esquerda do rótulo (lucide). */
  icon?: LucideIcon;
}

/** Item de navegação com ícone + animação no hover/foco:
 * - desktop: o ícone sobe e cresce levemente e uma linha fina se abre do
 *   centro sob o rótulo (só nos itens inativos -- o ativo já é a pill);
 * - mobile (painel lateral): o ícone desliza um pouco para a direita.
 * Tudo em `motion-safe:`, então quem pede movimento reduzido no sistema
 * operacional vê só a troca de cor, sem deslocamento. */
function NavButton({
  item,
  active,
  onNavigate,
  className,
  mobile = false,
}: {
  item: HeaderNavItem;
  active: boolean;
  onNavigate: () => void;
  className?: string;
  mobile?: boolean;
}) {
  const Icone = item.icon;
  return (
    <button
      type="button"
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative z-10 inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        active
          ? cn("font-semibold text-primary", mobile && "bg-secondary")
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        // Linha que se abre do centro sob o rótulo (desktop, item inativo).
        !mobile &&
          !active &&
          "after:absolute after:inset-x-3.5 after:bottom-0.5 after:h-0.5 after:origin-center after:scale-x-0 after:rounded-full after:bg-primary after:transition-transform after:duration-300 after:ease-out hover:after:scale-x-100 focus-visible:after:scale-x-100",
        className,
      )}
    >
      {Icone && (
        <Icone
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 transition-transform duration-200 ease-out",
            mobile
              ? "motion-safe:group-hover:translate-x-0.5 motion-safe:group-focus-visible:translate-x-0.5"
              : "motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:scale-110 motion-safe:group-focus-visible:-translate-y-0.5 motion-safe:group-focus-visible:scale-110",
            active
              ? "text-primary"
              : "text-muted-foreground group-hover:text-primary",
          )}
        />
      )}
      {item.label}
    </button>
  );
}

type Retangulo = { left: number; top: number; width: number; height: number };

/** Última posição da pill ativa, fora do React de propósito: trocar de
 * página pode desmontar o header (troca de layout, ou o Suspense da rota
 * carregando o chunk da página). Guardando aqui, o header novo nasce com a
 * pill onde ela estava e desliza até o item novo, em vez de só aparecer. */
let ultimaPosicaoIndicador: Retangulo | null = null;

/** Pill de fundo do item ativo que desliza entre os itens da navegação
 * desktop. Mede o botão com `aria-current="page"` dentro do `<nav>` e
 * anima `transform`/`width` (barato para o navegador). Sem item ativo na
 * lista (ex.: /dashboard no AppLayout), a pill some com fade. */
function useIndicadorAtivo(dependencia: string) {
  const navRef = useRef<HTMLElement>(null);
  const [posicao, setPosicao] = useState<Retangulo | null>(
    ultimaPosicaoIndicador,
  );
  const [visivel, setVisivel] = useState(ultimaPosicaoIndicador !== null);
  const primeiraMedida = useRef(true);

  const medir = useCallback((animarDoAnterior: boolean) => {
    const ativo = navRef.current?.querySelector<HTMLElement>(
      '[aria-current="page"]',
    );
    if (!ativo || ativo.offsetWidth === 0) {
      setVisivel(false);
      return;
    }
    const nova: Retangulo = {
      left: ativo.offsetLeft,
      top: ativo.offsetTop,
      width: ativo.offsetWidth,
      height: ativo.offsetHeight,
    };
    ultimaPosicaoIndicador = nova;
    setVisivel(true);
    if (animarDoAnterior) {
      // Duplo rAF: garante que a posição antiga chegue a ser pintada antes
      // de trocar, senão o navegador pula direto pro fim sem transição.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setPosicao(nova)),
      );
    } else {
      setPosicao(nova);
    }
  }, []);

  useLayoutEffect(() => {
    const deOndeVeio = primeiraMedida.current && posicao !== null;
    primeiraMedida.current = false;
    medir(deOndeVeio);
    // `posicao` fica fora das dependências de propósito: só a troca de rota
    // (ou a lista de itens) deve remedir aqui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dependencia, medir]);

  useLayoutEffect(() => {
    const aoRedimensionar = () => medir(false);
    window.addEventListener("resize", aoRedimensionar);
    // Fontes web mudam a largura do texto depois do 1º paint.
    void document.fonts?.ready.then(aoRedimensionar);
    return () => window.removeEventListener("resize", aoRedimensionar);
  }, [medir]);

  return { navRef, posicao, visivel };
}

function IndicadorAtivo({
  posicao,
  visivel,
}: {
  posicao: Retangulo | null;
  visivel: boolean;
}) {
  if (!posicao) return null;
  return (
    <span
      aria-hidden="true"
      data-testid="indicador-ativo"
      className={cn(
        "pointer-events-none absolute top-0 left-0 z-0 rounded-full bg-secondary shadow-sm",
        "transition-[transform,width,height,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        visivel ? "opacity-100" : "opacity-0",
      )}
      style={{
        width: posicao.width,
        height: posicao.height,
        transform: `translate(${posicao.left}px, ${posicao.top}px)`,
      }}
    />
  );
}

/** Header unificado: logo + nome do app + navegação numa barra só. Aba ativa
 * é pill preenchida (bg-secondary + texto primary), não borda inferior --
 * decisão deliberada, mantida mesmo a Seção 5 da constituicao_frontend.md
 * preferir borda.
 *
 * `leftExtra` é o slot pro SeletorEquipamento (AppLayout); `rightExtra` é
 * livre para extras de um layout. O sino de notificações é fixo do header
 * (aparece em toda página logada; some sozinho para visitante). No mobile
 * extras e sino permanecem no cabeçalho, sem abrir o painel lateral.
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
  const { navRef, posicao, visivel } = useIndicadorAtivo(
    `${location.pathname}|${navItems.map((i) => i.path).join(",")}`,
  );

  function irPara(path: string) {
    navigate(path);
    setMenuAberto(false);
  }

  return (
    // Fixo no topo com vidro fosco: o conteúdo rola por baixo sem perder a
    // navegação, e o fundo translúcido deixa o header "leve".
    <header className="sticky top-0 z-40 border-b border-border/70 bg-card/85 backdrop-blur-md supports-[backdrop-filter]:bg-card/70">
      <div
        className={cn(
          CONTAINER_CLASS,
          "flex h-16 items-center justify-between gap-4",
        )}
      >
        <div className="flex min-w-0 items-center gap-4">
          {/* A marca leva à entrada operacional definida para o sistema. */}
          <Link
            to="/monitoramento-equipamentos"
            className="flex shrink-0 items-center gap-2.5 text-foreground"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[#1f4c42] font-display text-[15px] font-bold text-primary-foreground shadow-sm ring-1 ring-black/5 ring-inset">
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
          <nav
            ref={navRef}
            className="relative isolate flex flex-wrap items-center justify-end gap-1"
          >
            <IndicadorAtivo posicao={posicao} visivel={visivel} />
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
          {/* Sino e UserMenu ficam direto no AppHeader (não num slot) -- é
              usado por TODA página (PainelGeralPage, AppLayout,
              MonitoramentoLayout), então 1 lugar só cobre o sistema todo. */}
          <NotificationBell />
          <UserMenu />
        </div>

        {/* Mobile/tablet (<1024px): extras no header; navegação e conta no painel. */}
        <div className="flex shrink-0 items-center gap-1 lg:hidden">
          {leftExtra}
          {rightExtra}
          <NotificationBell />
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
                          mobile
                          className={cn(
                            "min-h-11 w-full gap-2.5 rounded-md border-l-[3px] px-3.5 py-2.5 text-left text-sm",
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
