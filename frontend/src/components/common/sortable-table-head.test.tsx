import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { SortableTableHead } from './sortable-table-head';

function renderNaTabela(props: Parameters<typeof SortableTableHead>[0]) {
  return render(
    <table>
      <thead>
        <tr>
          <SortableTableHead {...props} />
        </tr>
      </thead>
    </table>,
  );
}

describe('SortableTableHead', () => {
  it('reflete aria-sort quando ativo, ascendente e descendente', () => {
    const { rerender } = render(
      <table>
        <thead>
          <tr>
            <SortableTableHead ativo={false} direcao="asc" onToggle={() => {}}>
              Coluna
            </SortableTableHead>
          </tr>
        </thead>
      </table>,
    );
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'none');

    rerender(
      <table>
        <thead>
          <tr>
            <SortableTableHead ativo direcao="asc" onToggle={() => {}}>
              Coluna
            </SortableTableHead>
          </tr>
        </thead>
      </table>,
    );
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'ascending');

    rerender(
      <table>
        <thead>
          <tr>
            <SortableTableHead ativo direcao="desc" onToggle={() => {}}>
              Coluna
            </SortableTableHead>
          </tr>
        </thead>
      </table>,
    );
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'descending');
  });

  it('chama onToggle ao clicar e ao ativar por teclado (Enter)', async () => {
    const onToggle = vi.fn();
    renderNaTabela({ ativo: false, direcao: 'asc', onToggle, children: 'Coluna' });
    const botao = screen.getByRole('button', { name: 'Coluna' });

    await userEvent.click(botao);
    expect(onToggle).toHaveBeenCalledTimes(1);

    botao.focus();
    await userEvent.keyboard('{Enter}');
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('não tem violação de acessibilidade', async () => {
    const { container } = renderNaTabela({ ativo: true, direcao: 'asc', onToggle: () => {}, children: 'Coluna' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
