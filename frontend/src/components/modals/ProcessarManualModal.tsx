import { useState, type CSSProperties } from 'react';
import { Modal } from '../common/Modal';
import { ANOS, MESES } from '../../data/constants';
import { colors } from '../../styles/tokens';

interface Props {
  onClose: () => void;
  onProcessar: (mes: string, ano: string) => void;
}

const ABA_CONSOLIDADA = 'TOMÓGRAFOS';
const ARQUIVOS_GRANULARES = [{ origem: 'equipamentos.xlsx', destino: 'TOMÓGRAFOS' }];

export function ProcessarManualModal({ onClose, onProcessar }: Props) {
  const [mes, setMes] = useState('Agosto');
  const [ano, setAno] = useState('2026');

  return (
    <Modal onClose={onClose} maxWidth={640}>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#16213e' }}>Processamento de dados</div>
      <div style={{ color: colors.mutedText, fontSize: 13, marginTop: 8 }}>
        Carregue as planilhas de origem (.xlsx) e rode o pipeline completo: extração, normalização, validação e
        cálculo de déficit.
      </div>

      <div style={{ marginTop: 16, fontSize: 12, color: colors.mutedText, lineHeight: 1.7 }}>
        O pipeline lê dois tipos de arquivo. Os <strong>granulares</strong> contêm os dados por serviço; o{' '}
        <strong>base consolidada</strong> é o arquivo principal que o sistema consome e que será gerado/atualizado.
      </div>

      <div style={{ marginTop: 16, border: '1px solid #e8ecf6', borderRadius: 8, overflow: 'hidden' }}>
        <div
          style={{
            background: '#f0f4ff',
            padding: '12px 16px',
            borderBottom: '1px solid #e8ecf6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: colors.primary }}>Arquivo base consolidada</div>
            <div style={{ fontSize: 11.5, color: colors.mutedText, marginTop: 1 }}>
              Arquivo principal consumido pelo sistema — gerado/atualizado a cada execução
            </div>
          </div>
          <button style={uploadButtonStyle}>⬆ Upload</button>
        </div>
        <div style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: colors.primary,
              background: colors.primaryLight,
              padding: '4px 10px',
              borderRadius: 6,
            }}
          >
            {ABA_CONSOLIDADA}
          </span>
        </div>
      </div>

      <div style={{ marginTop: 10, border: `1px solid ${colors.border}`, borderRadius: 8, overflow: 'hidden' }}>
        <div
          style={{
            background: '#fafbfd',
            padding: '12px 16px',
            borderBottom: '1px solid #eef0f4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#16213e' }}>Arquivos granulares</div>
            <div style={{ fontSize: 11.5, color: colors.mutedText, marginTop: 1 }}>
              Dados por serviço — populam as abas do arquivo base
            </div>
          </div>
          <button style={uploadButtonStyle}>⬆ Upload</button>
        </div>
        <div style={{ padding: '12px 16px' }}>
          {ARQUIVOS_GRANULARES.map((g) => (
            <div key={g.origem} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: '1px solid #f7f8fb' }}>
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  background: colors.primaryLight,
                  color: colors.primary,
                  padding: '3px 8px',
                  borderRadius: 4,
                  minWidth: 140,
                  textAlign: 'center',
                }}
              >
                {g.origem}
              </span>
              <span style={{ fontSize: 12, color: colors.subtleText }}>→</span>
              <span style={{ fontSize: 11.5, color: '#475066' }}>
                popula <strong>{g.destino}</strong>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 10, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '14px 16px' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#16213e', marginBottom: 12 }}>Parâmetros de execução</div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: '#475066', marginBottom: 6 }}>Mês (competência)</div>
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

      <button
        onClick={() => onProcessar(mes, ano)}
        style={{
          width: '100%',
          marginTop: 16,
          padding: 14,
          border: 'none',
          borderRadius: 8,
          background: '#3b6d11',
          color: '#fff',
          fontWeight: 700,
          fontSize: 14,
          cursor: 'pointer',
        }}
      >
        ▶ Processar agora
      </button>
    </Modal>
  );
}

const uploadButtonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  background: '#fff',
  border: '1px solid #c7cede',
  color: '#1a3a9c',
  fontWeight: 600,
  fontSize: 12,
  padding: '7px 12px',
  borderRadius: 6,
  cursor: 'pointer',
};
