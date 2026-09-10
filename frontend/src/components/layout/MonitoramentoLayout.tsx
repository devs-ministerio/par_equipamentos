/** Layout compartilhado das paginas de monitoramento interno -- achado
 * 2026-09-10, pedido do usuario: "implante os menus de navegação".
 * Espelho de `AppLayout.tsx` (Header + nav + Outlet dentro do mesmo
 * wrapper), so troca `TopNav` por `MonitoramentoTopNav` (sem seletor de
 * familia) -- antes cada pagina de monitoramento vivia fora de qualquer
 * layout, com breadcrumb manual proprio e nenhum link de volta pro
 * resto do app. */
import { Outlet } from 'react-router-dom';
import { colors, layout } from '../../styles/tokens';
import { Header } from './Header';
import { MonitoramentoTopNav } from './MonitoramentoTopNav';

export function MonitoramentoLayout() {
  return (
    <div style={{ minHeight: '100vh', background: colors.surface, color: colors.primaryDark, fontSize: 14 }}>
      <Header />
      <MonitoramentoTopNav />
      <div style={{ padding: layout.pagePadding, maxWidth: layout.maxWidth, margin: '0 auto' }}>
        <Outlet />
      </div>
    </div>
  );
}
