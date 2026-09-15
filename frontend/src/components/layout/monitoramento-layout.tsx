/** Layout compartilhado das paginas de monitoramento interno -- achado
 * 2026-09-10, pedido do usuario: "implante os menus de navegação".
 * Header + nav unificados no `AppHeader` (achado 2026-09-11, mockup
 * completo anexado pelo usuario) -- antes cada pagina de monitoramento
 * vivia fora de qualquer layout, com breadcrumb manual proprio e nenhum
 * link de volta pro resto do app. */
import { Outlet } from 'react-router-dom';
import { NotificationBell } from '@/components/features/notification-bell';
import { AppHeader } from './app-header';

const NAV_ITEMS = [
  // Primeiro item do menu, nao mais um botao "← Voltar" separado -- volta
  // pra analise de merito de hipo/hiperssuficiencia (fora deste layout).
  { path: '/dashboard', label: 'Análise de mérito' },
  // isActive exato -- "/monitoramento-equipamentos" e prefixo de todas as
  // outras rotas deste layout, startsWith (default) marcava esta E a
  // rota atual como ativas ao mesmo tempo.
  { path: '/monitoramento-equipamentos', label: 'Dados oficiais', isActive: (p: string) => p === '/monitoramento-equipamentos' },
  {
    path: '/monitoramento-equipamentos/instrumentos',
    label: 'Monitoramento interno',
    // Rota exata OU rota de detalhe do instrumento (/instrumentos/{nr})
    // conta como ativa -- ela e a secao-mae.
    isActive: (pathname: string) =>
      pathname === '/monitoramento-equipamentos/instrumentos' ||
      pathname.startsWith('/monitoramento-equipamentos/instrumentos/'),
  },
  { path: '/monitoramento-equipamentos/painel', label: 'Painel de gestão' },
];

export function MonitoramentoLayout() {
  return (
    <div className="min-h-screen bg-background text-sm text-foreground">
      <AppHeader navItems={NAV_ITEMS} rightExtra={<NotificationBell />} />
      <div className="mx-auto max-w-[1400px] px-6 py-6">
        <Outlet />
      </div>
    </div>
  );
}
