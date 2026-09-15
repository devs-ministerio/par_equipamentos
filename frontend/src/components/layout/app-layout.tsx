import { Outlet } from 'react-router-dom';
import { FamiliaEquipamentoProvider } from '../../context/familia-equipamento-context';
import { AppHeader } from './app-header';
import { SeletorEquipamento } from './top-nav';
import { NAV_ITEMS_MONITORAMENTO } from './monitoramento-nav-items';

/** Nav do topo igual à do Monitoramento (achado 2026-09-15, pedido do
 * usuário: "quero no topo os nav do monitoramento") -- mesmo array
 * (Dados oficiais/Monitoramento interno/Painel de gestão), sem
 * "Análise de mérito" (self-link não faz sentido já estando aqui). A
 * navegação ENTRE as 3 páginas de Análise de mérito (Dashboard/Mapa/
 * Relatórios) fica no cabeçalho de cada página (NavBoxesAnaliseMerito),
 * não mais aqui -- mesmo padrão de Dados oficiais/Mesa de trabalho, que
 * também têm seus cards de cabeçalho próprios por página. */
export function AppLayout() {
  return (
    <FamiliaEquipamentoProvider>
      <div className="min-h-screen bg-background text-sm text-foreground">
        <AppHeader navItems={NAV_ITEMS_MONITORAMENTO} leftExtra={<SeletorEquipamento />} />
        <div className="mx-auto max-w-[1400px] px-6 py-6">
          <Outlet />
        </div>
      </div>
    </FamiliaEquipamentoProvider>
  );
}
