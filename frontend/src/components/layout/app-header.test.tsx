import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { axe } from 'jest-axe';
import { AppHeader, type HeaderNavItem } from './app-header';

// Fronteira externa (sessão via API) mockada -- o que está sob teste é o
// AppHeader (menu mobile, nav), não `useAuthSession`.
vi.mock('@/hooks/useAuthSession', () => ({
  useAuthSession: () => ({
    usuarioAtual: null,
    autenticado: false,
    podeEditar: false,
    checandoSessao: false,
    sair: vi.fn(),
  }),
}));

const NAV_ITEMS: HeaderNavItem[] = [
  { path: '/dashboard', label: 'Análise de mérito' },
  { path: '/monitoramento-equipamentos', label: 'Dados oficiais' },
];

function renderHeader() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <AppHeader navItems={NAV_ITEMS} />
    </MemoryRouter>,
  );
}

describe('AppHeader', () => {
  it('mostra a nav completa (desktop) e o botão de menu mobile', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: 'Análise de mérito' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir menu' })).toBeInTheDocument();
  });

  it('abre o menu mobile e navega ao clicar num item', async () => {
    renderHeader();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    expect(screen.getByRole('heading', { name: 'Menu' })).toBeInTheDocument();

    // 2 botões com o mesmo rótulo agora (nav desktop escondida por CSS +
    // nav do menu mobile) -- clica no de dentro do dialog.
    const itensMenu = screen.getAllByRole('button', { name: 'Dados oficiais' });
    await userEvent.click(itensMenu[itensMenu.length - 1]);

    // Sheet fecha após navegar -- o heading "Menu" some.
    expect(screen.queryByRole('heading', { name: 'Menu' })).not.toBeInTheDocument();
  });

  it('não tem violação de acessibilidade', async () => {
    const { container } = renderHeader();
    expect(await axe(container)).toHaveNoViolations();
  });
});
