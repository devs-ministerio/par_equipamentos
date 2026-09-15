/** Layout compartilhado das paginas de monitoramento interno -- achado
 * 2026-09-10, pedido do usuario: "implante os menus de navegação".
 * Header + nav unificados no `AppHeader` (achado 2026-09-11, mockup
 * completo anexado pelo usuario) -- antes cada pagina de monitoramento
 * vivia fora de qualquer layout, com breadcrumb manual proprio e nenhum
 * link de volta pro resto do app. */
import { Outlet, useLocation } from 'react-router-dom';
import { NotificationBell } from '@/components/features/notification-bell';
import { AppHeader, type HeaderNavItem } from './app-header';

// Rota-mae do Monitoramento Interno (exata OU detalhe de instrumento) --
// mesmo criterio de isActive usado no item abaixo.
const EH_MONITORAMENTO_INTERNO = (pathname: string) =>
  pathname === '/monitoramento-equipamentos/instrumentos' ||
  pathname.startsWith('/monitoramento-equipamentos/instrumentos/');

const NAV_ITEMS_BASE: HeaderNavItem[] = [
  // "Análise de mérito" NAO fica mais fixo em toda pagina do layout --
  // achado 2026-09-15, pedido do usuario: "o botão para ir para a
  // analise de méritos pode colocar apenas na pagina de monitoramento
  // interno, no menu". Filtrado condicionalmente no componente abaixo,
  // nao aqui (a lista base fica sem ele -- ver NAV_ITEMS).
  { path: '/monitoramento-equipamentos', label: 'Dados oficiais', isActive: (p) => p === '/monitoramento-equipamentos' },
  {
    path: '/monitoramento-equipamentos/instrumentos',
    label: 'Monitoramento interno',
    isActive: EH_MONITORAMENTO_INTERNO,
  },
  { path: '/monitoramento-equipamentos/painel', label: 'Painel de gestão' },
];

const ITEM_ANALISE_MERITO: HeaderNavItem = { path: '/dashboard', label: 'Análise de mérito' };

export function MonitoramentoLayout() {
  const location = useLocation();
  // So aparece dentro do Monitoramento Interno (pagina de overview ou
  // detalhe de 1 instrumento) -- primeiro item da lista, mesma posicao
  // de antes, so que agora condicional em vez de fixo em todo lugar.
  const navItems = EH_MONITORAMENTO_INTERNO(location.pathname)
    ? [ITEM_ANALISE_MERITO, ...NAV_ITEMS_BASE]
    : NAV_ITEMS_BASE;

  return (
    <div className="min-h-screen bg-background text-sm text-foreground">
      <AppHeader navItems={navItems} rightExtra={<NotificationBell />} />
      <div className="mx-auto max-w-[1400px] px-6 py-6">
        <Outlet />
      </div>
    </div>
  );
}
