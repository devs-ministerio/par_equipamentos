import { Outlet } from 'react-router-dom';
import { colors, layout } from '../../styles/tokens';
import { Header } from './Header';
import { TopNav } from './TopNav';

export function AppLayout() {
  return (
    <div style={{ minHeight: '100vh', background: colors.surface, color: colors.primaryDark, fontSize: 14 }}>
      <Header />
      <TopNav />
      <div style={{ padding: layout.pagePadding, maxWidth: layout.maxWidth, margin: '0 auto' }}>
        <Outlet />
      </div>
    </div>
  );
}
