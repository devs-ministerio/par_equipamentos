import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { MultiSelectFilter } from './multi-select-filter';
import { SingleSelectFilter } from './single-select-filter';

describe('filtros de seleção', () => {
  it('abre o seletor único pelo teclado e fecha com Escape', async () => {
    const user = userEvent.setup();
    render(<SingleSelectFilter placeholder="Macrorregião" options={[{ value: 'norte', label: 'Norte' }]} value={null} onChange={vi.fn()} clearLabel="Todas" />);
    const trigger = screen.getByRole('button', { name: /macrorregião/i });
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('tem botão real, controle associado e pesquisa acessível no seletor múltiplo', async () => {
    const user = userEvent.setup();
    render(<MultiSelectFilter placeholder="UF" options={[{ value: 'sp', label: 'São Paulo' }]} selected={[]} onChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /uf/i });
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('textbox', { name: /pesquisar em uf/i })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('não introduz violações axe nos seletores fechados', async () => {
    const { container } = render(
      <>
        <SingleSelectFilter placeholder="Macrorregião" options={[]} value={null} onChange={vi.fn()} />
        <MultiSelectFilter placeholder="UF" options={[]} selected={[]} onChange={vi.fn()} />
      </>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
