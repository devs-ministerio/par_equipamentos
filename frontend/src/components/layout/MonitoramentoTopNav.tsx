/** Menu de navegação do monitoramento interno -- achado 2026-09-10,
 * pedido do usuário: "a navegação pode utilizar o mesmo padrão que
 * usamos na parte de hipo e hiper... implante os menus de navegação".
 * Mesmo visual/padrão de `TopNav.tsx` (barra `colors.topbarBg`, botão
 * com destaque de rota ativa via `location.pathname.startsWith`), sem o
 * seletor de família (não se aplica aqui, monitoramento cobre todos os
 * instrumentos de uma vez, não por família). O botão "← Análise de
 * Mérito" é o link explícito de volta pro app principal (hipo/hiper) --
 * pedido do usuário: "o botão de navegação para a análise de mérito
 * deve ficar no menu do monitoramento interno". */
import { useLocation, useNavigate } from 'react-router-dom';
import { colors, layout } from '../../styles/tokens';

const ITEMS = [
  { path: '/monitoramento-equipamentos', label: 'Convênios' },
  { path: '/monitoramento-equipamentos/instrumentos', label: 'Visão Geral' },
  { path: '/monitoramento-equipamentos/painel', label: 'Painel de Gestão' },
];

export function MonitoramentoTopNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div style={{ background: colors.topbarBg, borderBottom: `1px solid ${colors.topbarBorder}` }}>
      <div
        style={{
          maxWidth: layout.maxWidth,
          margin: '0 auto',
          padding: `0 ${layout.pagePadding}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 56,
        }}
      >
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            height: 32,
            border: `1px solid ${colors.topbarBorder}`,
            borderRadius: 6,
            background: '#fff',
            color: colors.primaryDark,
            fontWeight: 600,
            fontSize: 13,
            padding: '0 12px',
            cursor: 'pointer',
          }}
        >
          ← Análise de Mérito
        </button>
        <div style={{ display: 'flex', gap: 4 }}>
          {ITEMS.map((item) => {
            // Rota exata OU rota de detalhe do instrumento (/instrumentos/{nr})
            // conta como "Visão Geral" ativa -- ela é a seção-mãe.
            const active =
              location.pathname === item.path ||
              (item.path === '/monitoramento-equipamentos/instrumentos' &&
                location.pathname.startsWith('/monitoramento-equipamentos/instrumentos/'));
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                style={{
                  height: 36,
                  border: 'none',
                  background: active ? colors.primaryLight : 'transparent',
                  color: active ? colors.primary : '#475066',
                  fontWeight: active ? 700 : 500,
                  fontSize: 13,
                  padding: '0 16px',
                  cursor: 'pointer',
                  borderRadius: 6,
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
