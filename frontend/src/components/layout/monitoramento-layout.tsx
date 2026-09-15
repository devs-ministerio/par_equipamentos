/** Layout compartilhado das paginas de monitoramento interno -- achado
 * 2026-09-10, pedido do usuario: "implante os menus de navegação".
 * Header + nav unificados no `AppHeader` (achado 2026-09-11, mockup
 * completo anexado pelo usuario) -- antes cada pagina de monitoramento
 * vivia fora de qualquer layout, com breadcrumb manual proprio e nenhum
 * link de volta pro resto do app. */
import { Outlet, useLocation } from 'react-router-dom';
import { NotificationBell } from '@/components/features/notification-bell';
import { AppHeader } from './app-header';
import { EH_MONITORAMENTO_INTERNO, ITEM_ANALISE_MERITO, NAV_ITEMS_MONITORAMENTO } from './monitoramento-nav-items';

export function MonitoramentoLayout() {
  const location = useLocation();
  // "Análise de mérito" só aparece dentro do Monitoramento Interno --
  // achado 2026-09-15, pedido do usuario: "o botão para ir para a analise
  // de méritos pode colocar apenas na pagina de monitoramento interno".
  const navItems = EH_MONITORAMENTO_INTERNO(location.pathname)
    ? [ITEM_ANALISE_MERITO, ...NAV_ITEMS_MONITORAMENTO]
    : NAV_ITEMS_MONITORAMENTO;

  return (
    <div className="min-h-screen bg-background text-sm text-foreground">
      <AppHeader navItems={navItems} rightExtra={<NotificationBell />} />
      <div className="mx-auto max-w-[1400px] px-6 py-6">
        <Outlet />
      </div>
    </div>
  );
}
