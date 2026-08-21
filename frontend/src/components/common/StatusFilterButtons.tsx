import type { StatusCobertura } from '../../types/domain';
import { colors } from '../../styles/tokens';

interface Props {
  selecionados: Set<StatusCobertura>;
  onChange: (proximo: Set<StatusCobertura>) => void;
}

/**
 * Substitui a busca por texto nas tabelas de Cobertura Assistencial (pedido
 * explicito) -- dois botoes clicaveis (toggle) que filtram a lista por
 * status. Nenhum selecionado = mostra tudo; um ou os dois selecionados =
 * so as linhas daquele(s) status. Hipossuficiente sempre primeiro
 * (vermelho antes do verde, mesma ordem ja adotada nas legendas).
 */
export function StatusFilterButtons({ selecionados, onChange }: Props) {
  function toggle(status: StatusCobertura) {
    const proximo = new Set(selecionados);
    proximo.has(status) ? proximo.delete(status) : proximo.add(status);
    onChange(proximo);
  }

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <button
        onClick={() => toggle('Hipossuficiente')}
        style={{
          padding: '6px 12px',
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          border: `1.5px solid ${selecionados.has('Hipossuficiente') ? colors.hipoRed : colors.border}`,
          background: selecionados.has('Hipossuficiente') ? colors.hipoRedBg : '#f7f8fb',
          color: selecionados.has('Hipossuficiente') ? colors.hipoRed : '#475066',
        }}
      >
        Hipossuficiente
      </button>
      <button
        onClick={() => toggle('Hiperssuficiente')}
        style={{
          padding: '6px 12px',
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          border: `1.5px solid ${selecionados.has('Hiperssuficiente') ? colors.hiperGreen : colors.border}`,
          background: selecionados.has('Hiperssuficiente') ? colors.hiperGreenBg : '#f7f8fb',
          color: selecionados.has('Hiperssuficiente') ? colors.hiperGreen : '#475066',
        }}
      >
        Hiperssuficiente
      </button>
    </div>
  );
}
