/** Layout compartilhado das paginas de monitoramento interno -- achado
 * 2026-09-10, pedido do usuario: "implante os menus de navegação".
 * Header + nav unificados no `AppHeader` (achado 2026-09-11, mockup
 * completo anexado pelo usuario) -- antes cada pagina de monitoramento
 * vivia fora de qualquer layout, com breadcrumb manual proprio e nenhum
 * link de volta pro resto do app. */
import { Outlet, useLocation } from "react-router-dom";
import { CONTAINER_CLASS } from "@/lib/layout";
import { AppHeader } from "./app-header";
import { AppFooter } from "./app-footer";
import { NAV_ITEMS_MONITORAMENTO } from "./monitoramento-nav-items";

export function MonitoramentoLayout() {
  // "Análise de mérito" não é item do header: o acesso fica dentro da Mesa
  // de trabalho do Monitoramento interno (monitoramento-overview-page.tsx).

  const location = useLocation();
  return (
    <div className="flex min-h-screen flex-col text-sm text-foreground">
      <AppHeader navItems={NAV_ITEMS_MONITORAMENTO} />
      {/* `key` por rota: a animação de entrada roda a cada troca de página. */}
      <main
        key={location.pathname}
        className={`${CONTAINER_CLASS} animar-entrada w-full flex-1 py-8`}
      >
        <Outlet />
      </main>
      <AppFooter />
    </div>
  );
}
