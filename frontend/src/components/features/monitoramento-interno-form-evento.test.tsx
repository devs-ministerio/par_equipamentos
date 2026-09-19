/** Plan Mode monitoramento-evolucao 2026-09-19 (Bloco 3) -- fecha o bug
 * corrigido no backend (evento de cronograma físico/regulatório sem
 * vínculo de fase geral): o form precisa exigir e enviar `faseGeralId`
 * pra marco fora do grupo fase_geral, e nunca exigir pra marco que já É
 * de fase_geral. */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MarcoCatalogo } from '@/services/monitoramento-marcos';
import { MonitoramentoInternoFormEvento } from './monitoramento-interno-form-evento';

const MARCOS: MarcoCatalogo[] = [
  { id: 1, codigo: 'fase_em_licitacao', grupo: 'fase_geral', ordem: 1, execucao_fisica_pct_referencia: 0.1, rotulo: 'Em licitação', descricao_referencia: null },
  { id: 2, codigo: 'fase_contratado', grupo: 'fase_geral', ordem: 4, execucao_fisica_pct_referencia: 0.5, rotulo: 'Contratado', descricao_referencia: null },
  { id: 12, codigo: 'cronograma_entrega', grupo: 'cronograma_fisico', ordem: null, execucao_fisica_pct_referencia: null, rotulo: 'Entrega no estabelecimento', descricao_referencia: null },
];

async function selecionarMarco(rotulo: string) {
  const select = screen.getByLabelText('Marco');
  await userEvent.selectOptions(select, within(select).getByRole('option', { name: rotulo }));
}

describe('MonitoramentoInternoFormEvento', () => {
  it('não exige fase geral para marco que já é de grupo fase_geral', async () => {
    const onRegistrar = vi.fn().mockResolvedValue(undefined);
    render(<MonitoramentoInternoFormEvento marcos={MARCOS} onRegistrar={onRegistrar} />);

    await selecionarMarco('Em licitação');
    expect(screen.queryByLabelText('Fase geral correspondente')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Registrar evento' }));
    expect(onRegistrar).toHaveBeenCalledTimes(1);
  });

  it('exige fase geral pra marco de cronograma físico e bloqueia o submit sem ela', async () => {
    const onRegistrar = vi.fn().mockResolvedValue(undefined);
    render(<MonitoramentoInternoFormEvento marcos={MARCOS} onRegistrar={onRegistrar} />);

    await selecionarMarco('Entrega no estabelecimento');
    expect(screen.getByLabelText('Fase geral correspondente')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Registrar evento' }));
    expect(screen.getByText('Selecione a fase geral correspondente.')).toBeInTheDocument();
    expect(onRegistrar).not.toHaveBeenCalled();
  });

  it('envia faseGeralId quando marco físico e fase são selecionados', async () => {
    const onRegistrar = vi.fn().mockResolvedValue(undefined);
    render(<MonitoramentoInternoFormEvento marcos={MARCOS} onRegistrar={onRegistrar} />);

    await selecionarMarco('Entrega no estabelecimento');
    const selectFase = screen.getByLabelText('Fase geral correspondente');
    await userEvent.selectOptions(selectFase, within(selectFase).getByRole('option', { name: 'Contratado' }));
    await userEvent.click(screen.getByRole('button', { name: 'Registrar evento' }));

    expect(onRegistrar).toHaveBeenCalledWith(expect.objectContaining({ marcoId: '12', faseGeralId: '2' }));
  });

  it('em modo de correção mostra o marco fixo (não editável) e rótulo customizado', () => {
    render(
      <MonitoramentoInternoFormEvento
        marcos={MARCOS}
        marcoFixo={MARCOS[2]}
        rotuloSubmit="Salvar correção"
        onRegistrar={vi.fn()}
      />,
    );

    expect(screen.getByText('Entrega no estabelecimento')).toBeInTheDocument();
    expect(screen.queryByLabelText('Marco')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar correção' })).toBeInTheDocument();
  });
});
