import type { ReactNode } from 'react';
import type { NivelCoberturaRow } from '../../types/domain';
import { calcularCoeficiente } from '../../utils/coeficiente';
import { formatMultiplicador } from '../../utils/format';
import { Modal } from '../common/Modal';
import { StatusBadge } from '../common/StatusBadge';
import { colors } from '../../styles/tokens';

interface Props {
  linha: NivelCoberturaRow;
  onClose: () => void;
}

function Linha({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderTop: '1px solid #f0f1f5' }}>
      <span style={{ fontSize: 12.5, color: '#667085' }}>{rotulo}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#16213e', textAlign: 'right' }}>{valor}</span>
    </div>
  );
}

/**
 * Detalhe do municipio -- so exibe dado que a linha (NivelCoberturaRow) ja
 * traz, sem fazer nenhuma requisicao nova (o municipio ja veio completo do
 * /municipality-coverage que alimentou a subcamada); mantem essa tela leve
 * de proposito, so um modal client-side em cima do que ja esta em memoria.
 */
export function MunicipioDetalheModal({ linha, onClose }: Props) {
  const coef = calcularCoeficiente(linha.oferta, linha.pop);

  return (
    <Modal onClose={onClose} maxWidth={440}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#16213e' }}>{linha.nome}</div>
          <div style={{ color: colors.mutedText, fontSize: 12.5, marginTop: 4 }}>
            {linha.uf} · {linha.macroNome ?? 'Macrorregião não informada'} · {linha.regiaoSaudeNome ?? 'Região de saúde não informada'}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Fechar"
          style={{ border: 'none', background: 'transparent', fontSize: 20, lineHeight: 1, color: colors.subtleText, cursor: 'pointer', padding: 4 }}
        >
          ✕
        </button>
      </div>

      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <StatusBadge cobertura={linha.cobertura} />
        <span style={{ fontSize: 13, fontWeight: 700, color: coef.corTexto }}>
          {coef.valor != null ? formatMultiplicador(coef.valor) : '—'}
        </span>
        <span style={{ fontSize: 11, color: colors.subtleText }}>tomógrafos SUS por 100 mil hab.</span>
      </div>

      <div style={{ marginTop: 8 }}>
        <Linha rotulo="Tomógrafos SUS" valor={linha.oferta} />
        <Linha rotulo="Tomógrafos totais (SUS + privados)" valor={linha.ofertaTotal} />
        <Linha rotulo="População SUS-dependente" valor={linha.pop.toLocaleString('pt-BR')} />
        <Linha rotulo="População IBGE (residente)" valor={linha.popResidente.toLocaleString('pt-BR')} />
        <Linha rotulo="Beneficiários de plano de saúde (ANS)" valor={linha.popAns.toLocaleString('pt-BR')} />
        <Linha rotulo="Macrorregião de saúde" valor={linha.macroNome ?? '—'} />
        <Linha rotulo="Região de saúde" valor={linha.regiaoSaudeNome ?? '—'} />
        <Linha rotulo="UF" valor={linha.uf} />
      </div>

      <button
        onClick={onClose}
        style={{
          width: '100%',
          marginTop: 20,
          padding: 11,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          background: '#fff',
          color: '#475066',
          fontWeight: 600,
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        Fechar
      </button>
    </Modal>
  );
}
