import { Link, Outlet, useLocation } from 'react-router-dom';
import { FamiliaEquipamentoProvider } from '../../context/familia-equipamento-context';
import { cn } from '@/lib/utils';
import { AppHeader } from './app-header';
import { SeletorEquipamento } from './top-nav';

/** Sub-nav de Análise de mérito -- achado 2026-09-15, pedido do usuário:
 * "preciso que o menu seja igual também na análise de méritos [...] Mapa,
 * Relatórios pode colocar embaixo assim como estava os botões que pedi
 * pra remover do monitoramento interno (dados oficiais e painel de
 * gestão)". Mesmo padrão visual das antigas "Ver dados oficiais"/"Painel
 * de gestão" de Mesa de trabalho (pill outline) -- só que agora como
 * barra de navegação real do layout, não botão de conteúdo de 1 página só
 * (por isso mora aqui, não em cada página). "Dashboard" saiu da lista
 * (pedido explícito do usuário, "esse botão pode remover") -- o link de
 * volta ("Monitoramento interno") ocupa o lugar dele.
 *
 * O item "Análise de mérito" -> "Dashboard" NÃO aparece mais fixo em toda
 * página do MonitoramentoLayout (ver monitoramento-layout.tsx) -- só na
 * página de Monitoramento Interno. Este componente é o espelho: o link
 * de volta pra Monitoramento Interno fica aqui, em todas as 3 páginas de
 * Análise de mérito (Dashboard/Mapa/Relatórios).
 */
const SUB_NAV_ITEMS = [
  { path: '/monitoramento-equipamentos/instrumentos', label: 'Monitoramento interno' },
  { path: '/mapa', label: 'Mapa' },
  { path: '/relatorios', label: 'Relatórios' },
];

function SubNavAnaliseMerito() {
  const location = useLocation();
  return (
    <div className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-2 px-6 py-2.5">
        {SUB_NAV_ITEMS.map((item) => {
          const ativo = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-xs font-bold no-underline transition-colors',
                ativo
                  ? 'border-primary bg-secondary text-primary'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function AppLayout() {
  return (
    <FamiliaEquipamentoProvider>
      <div className="min-h-screen bg-background text-sm text-foreground">
        {/* Top nav do AppHeader fica vazio -- Dashboard/Mapa/Relatórios
            desceram pra SubNavAnaliseMerito acima (mesmo espírito de
            PainelGeralPage.tsx, que também usa navItems={[]}). */}
        <AppHeader navItems={[]} leftExtra={<SeletorEquipamento />} />
        <SubNavAnaliseMerito />
        <div className="mx-auto max-w-[1400px] px-6 py-6">
          <Outlet />
        </div>
      </div>
    </FamiliaEquipamentoProvider>
  );
}
