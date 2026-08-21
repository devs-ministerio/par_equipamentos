import { useState } from 'react';
import { Modal } from '../common/Modal';
import { ANOS, MESES } from '../../data/constants';
import { colors } from '../../styles/tokens';

interface Fonte {
  label: string;
  desc: string;
}

// Fontes que o Modulo 5 (pipeline) vai consultar ao vivo -- espelha as
// mesmas 3 fontes do pipeline legado (src/extract/api_*.py): ElastiCNES pra
// oferta, SIDRA pra populacao, INCA pra estimativa de casos (usada em outras
// familias, mantida aqui so pra fidelidade ao prototipo).
const FONTES: Fonte[] = [
  { label: 'ElastiCNES / CNES', desc: 'Oferta de equipamentos por estabelecimento' },
  { label: 'SIDRA / IBGE', desc: 'Dados populacionais por macrorregião' },
  { label: 'INCA — estimativas de câncer', desc: 'Incidência estimada por tipo e região' },
];

interface Props {
  onClose: () => void;
  onGerar: (mes: string, ano: string) => void;
}

export function GerarAutomaticamenteModal({ onClose, onGerar }: Props) {
  const [mes, setMes] = useState('Agosto');
  const [ano, setAno] = useState('2026');

  return (
    <Modal onClose={onClose}>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#16213e' }}>Gerar automaticamente</div>
      <div style={{ color: colors.mutedText, fontSize: 13, marginTop: 8 }}>
        O sistema consultará as APIs ao vivo e recalculará todos os indicadores para a competência selecionada.
      </div>

      <div style={{ marginTop: 24, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '18px 20px' }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#16213e', marginBottom: 14 }}>Competência</div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: '#475066', marginBottom: 6 }}>Mês</div>
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: `1px solid ${colors.border}`, borderRadius: 6, fontSize: 13, background: '#f7f8fb' }}
            >
              {MESES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: '#475066', marginBottom: 6 }}>Ano</div>
            <select
              value={ano}
              onChange={(e) => setAno(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: `1px solid ${colors.border}`, borderRadius: 6, fontSize: 13, background: '#f7f8fb' }}
            >
              {ANOS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '18px 20px' }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#16213e', marginBottom: 12 }}>Fontes que serão consultadas</div>
        {FONTES.map((f) => (
          <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #f0f1f5' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors.hiperGreen, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{f.label}</div>
              <div style={{ fontSize: 11, color: colors.subtleText }}>{f.desc}</div>
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: colors.hiperGreen,
                background: colors.hiperGreenBg,
                padding: '3px 9px',
                borderRadius: 20,
              }}
            >
              Ativo
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 16,
          background: '#f3e3c4',
          border: '1px solid #e8d2a0',
          borderRadius: 6,
          padding: '10px 14px',
          color: '#ba7517',
          fontSize: 12.5,
        }}
      >
        <span>⚠</span>
        <span>Confira as decisões de configuração (D-01/D-02) antes de gerar — a geração usará a opção atualmente ativa.</span>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button
          onClick={onClose}
          style={{
            flex: 1,
            padding: 12,
            border: `1px solid #c7cede`,
            borderRadius: 8,
            background: '#fff',
            color: '#475066',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Cancelar
        </button>
        <button
          onClick={() => onGerar(mes, ano)}
          style={{
            flex: 2,
            padding: 12,
            border: 'none',
            borderRadius: 8,
            background: colors.primary,
            color: '#fff',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          ▶ Gerar para {mes}/{ano}
        </button>
      </div>
    </Modal>
  );
}
