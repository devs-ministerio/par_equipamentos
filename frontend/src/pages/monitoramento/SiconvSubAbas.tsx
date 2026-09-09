/** Dado aninhado do SICONV (empenhos/desembolsos/licitacoes/itens/termos
 * aditivos) como sub-abas em vez de secoes sempre-visiveis empilhadas --
 * ideia puxada do prototipo Stitch (so a estrutura, o dado e 100% real, ver
 * ConvenioCard.tsx). Reduz rolagem: card com bastante linha em todas as
 * tabelas nao vira uma coluna gigante, só a aba ativa renderiza. */
import { useState } from 'react';
import { colors } from '../../styles/tokens';
import { fmtData, fmtMoeda } from './format';
import type { SiconvEntrada } from './types';
import { estiloTabela, estiloTabelaWrapper, estiloTd, estiloTh } from './ui';

type AbaKey = 'itens' | 'empenhos' | 'desembolsos' | 'licitacoes' | 'termos' | 'fornecedores';

export function SiconvSubAbas({ siconv }: { siconv: SiconvEntrada }) {
  const contagens: Record<AbaKey, number> = {
    itens: siconv.itens_plano_aplicacao.length,
    empenhos: siconv.empenhos.length,
    desembolsos: siconv.desembolsos.length,
    licitacoes: siconv.licitacoes.length,
    termos: siconv.termos_aditivos.length,
    fornecedores: siconv.pagamentos.length,
  };
  const rotulos: Record<AbaKey, string> = {
    itens: 'Itens do plano',
    empenhos: 'Empenhos',
    desembolsos: 'Desembolsos',
    licitacoes: 'Licitações',
    termos: 'Termos aditivos',
    fornecedores: 'Fornecedores',
  };
  const ordem: AbaKey[] = ['itens', 'empenhos', 'desembolsos', 'licitacoes', 'termos', 'fornecedores'];
  // Abre por padrao na primeira aba que tem linha -- convenio raramente
  // tem as 5 preenchidas, nao faz sentido abrir numa vazia.
  const [aba, setAba] = useState<AbaKey>(() => ordem.find((k) => contagens[k] > 0) ?? 'itens');

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${colors.border}`, marginBottom: 10, flexWrap: 'wrap' }}>
        {ordem.map((k) => (
          <button
            key={k}
            onClick={() => setAba(k)}
            disabled={contagens[k] === 0}
            style={{
              padding: '6px 10px',
              fontSize: 11.5,
              fontWeight: 600,
              border: 'none',
              borderBottom: aba === k ? `2px solid ${colors.primary}` : '2px solid transparent',
              background: 'transparent',
              color: contagens[k] === 0 ? colors.subtleText : aba === k ? colors.primary : colors.mutedText,
              cursor: contagens[k] === 0 ? 'default' : 'pointer',
            }}
          >
            {rotulos[k]} ({contagens[k]})
          </button>
        ))}
      </div>

      {aba === 'itens' && (
        contagens.itens === 0 ? <VazioMsg /> : (
          <div style={estiloTabelaWrapper}>
            <table style={estiloTabela}>
              <thead><tr><th style={estiloTh}>Descrição</th><th style={{ ...estiloTh, textAlign: 'right' }}>Qtd</th><th style={{ ...estiloTh, textAlign: 'right' }}>Vl. unitário</th><th style={{ ...estiloTh, textAlign: 'right' }}>Vl. total</th></tr></thead>
              <tbody>
                {siconv.itens_plano_aplicacao.map((it) => (
                  <tr key={it.ID_ITEM_PAD}>
                    <td style={estiloTd}>{it.DESCRICAO_ITEM}</td>
                    <td style={{ ...estiloTd, textAlign: 'right' }}>{it.QTD_ITEM}</td>
                    <td style={{ ...estiloTd, textAlign: 'right' }}>{fmtMoeda(it.VALOR_UNITARIO_ITEM)}</td>
                    <td style={{ ...estiloTd, textAlign: 'right' }}>{fmtMoeda(it.VALOR_TOTAL_ITEM)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {aba === 'empenhos' && (
        contagens.empenhos === 0 ? <VazioMsg /> : (
          <div style={estiloTabelaWrapper}>
            <table style={estiloTabela}>
              <thead><tr><th style={estiloTh}>Nº empenho</th><th style={estiloTh}>Situação</th><th style={{ ...estiloTh, textAlign: 'right' }}>Valor</th></tr></thead>
              <tbody>
                {siconv.empenhos.map((e) => (
                  <tr key={e.ID_EMPENHO}><td style={estiloTd}>{e.NR_EMPENHO}</td><td style={estiloTd}>{e.DESC_SITUACAO_EMPENHO}</td><td style={{ ...estiloTd, textAlign: 'right' }}>{fmtMoeda(e.VALOR_EMPENHO)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {aba === 'desembolsos' && (
        contagens.desembolsos === 0 ? <VazioMsg /> : (
          <div style={estiloTabelaWrapper}>
            <table style={estiloTabela}>
              <thead><tr><th style={estiloTh}>Data</th><th style={{ ...estiloTh, textAlign: 'right' }}>Valor</th></tr></thead>
              <tbody>
                {siconv.desembolsos.map((d) => (
                  <tr key={d.ID_DESEMBOLSO}><td style={estiloTd}>{fmtData(d.DATA_DESEMBOLSO)}</td><td style={{ ...estiloTd, textAlign: 'right' }}>{fmtMoeda(d.VL_DESEMBOLSADO)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {aba === 'licitacoes' && (
        contagens.licitacoes === 0 ? <VazioMsg /> : (
          <div style={estiloTabelaWrapper}>
            <table style={estiloTabela}>
              <thead><tr><th style={estiloTh}>Processo</th><th style={estiloTh}>Modalidade</th><th style={estiloTh}>Status</th><th style={{ ...estiloTh, textAlign: 'right' }}>Valor</th></tr></thead>
              <tbody>
                {siconv.licitacoes.map((l) => (
                  <tr key={l.ID_LICITACAO}>
                    <td style={estiloTd}>{l.NR_PROCESSO_LICITACAO}</td>
                    <td style={estiloTd}>{l.TP_PROCESSO_COMPRA || l.MODALIDADE_LICITACAO || '—'}</td>
                    <td style={estiloTd}>{l.STATUS_LICITACAO}</td>
                    <td style={{ ...estiloTd, textAlign: 'right' }}>{fmtMoeda(l.VALOR_LICITACAO)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {aba === 'termos' && (
        contagens.termos === 0 ? <VazioMsg /> : (
          <div style={estiloTabelaWrapper}>
            <table style={estiloTabela}>
              <thead><tr><th style={estiloTh}>Tipo</th><th style={{ ...estiloTh, textAlign: 'right' }}>Valor global</th><th style={estiloTh}>Justificativa</th></tr></thead>
              <tbody>
                {siconv.termos_aditivos.map((t, i) => (
                  <tr key={i}><td style={estiloTd}>{t.TIPO_TA}</td><td style={{ ...estiloTd, textAlign: 'right' }}>{fmtMoeda(t.VL_GLOBAL_TA)}</td><td style={{ ...estiloTd, maxWidth: 360 }}>{(t.JUSTIFICATIVA_TA || '').slice(0, 200)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {aba === 'fornecedores' && (
        contagens.fornecedores === 0 ? <VazioMsg /> : (
          <div style={estiloTabelaWrapper}>
            <table style={estiloTabela}>
              <thead><tr><th style={estiloTh}>Fornecedor</th><th style={estiloTh}>Data</th><th style={estiloTh}>Documento</th><th style={{ ...estiloTh, textAlign: 'right' }}>Valor pago</th></tr></thead>
              <tbody>
                {siconv.pagamentos.map((p, i) => (
                  <tr key={p.NR_MOV_FIN || i}>
                    <td style={estiloTd}>{p.NOME_FORNECEDOR}</td>
                    <td style={estiloTd}>{fmtData(p.DATA_PAG)}</td>
                    <td style={estiloTd}>{p.DESC_DL}</td>
                    <td style={{ ...estiloTd, textAlign: 'right' }}>{fmtMoeda(p.VL_PAGO)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

function VazioMsg() {
  return <p style={{ fontSize: 12, color: colors.mutedText, fontStyle: 'italic' }}>Sem registro nessa categoria.</p>;
}
