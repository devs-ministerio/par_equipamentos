import { Outlet } from 'react-router-dom';
import { FamiliaEquipamentoProvider } from '../../context/familia-equipamento-context';
import { AppHeader } from './app-header';
import { SeletorEquipamento } from './top-nav';

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/mapa', label: 'Mapa' },
  { path: '/relatorios', label: 'Relatórios' },
];

export function AppLayout() {
  return (
    <FamiliaEquipamentoProvider>
      <div className="min-h-screen bg-background text-sm text-foreground">
        <AppHeader navItems={NAV_ITEMS} leftExtra={<SeletorEquipamento />} />
        <div className="mx-auto max-w-[1400px] px-6 py-6">
          <Outlet />
        </div>
      </div>
    </FamiliaEquipamentoProvider>
  );
}
