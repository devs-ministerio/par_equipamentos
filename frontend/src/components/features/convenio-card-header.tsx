/** Camada 1 (sempre visível) do card de convênio -- identificação, status,
 * programa, grade financeira. Extraído de convenio-card.tsx (Seção 6 da
 * migração: componente >200 linhas). */
import { colors } from '@/styles/tokens';
import { fmtData, fmtMoeda, pct } from '@/lib/monitoramento-format';
import type { ConvenioUnificado } from '@/types/monitoramento';
import { Campo, StatusPill } from './monitoramento-ui';

export function ConvenioCardHeader({
  c,
  monitorado,
  equipamentos,
  programaSiconv,
  programaTransfereGovNome,
  valorPagoFornecedor,
  pagamentosCount,
}: {
  c: ConvenioUnificado;
  monitorado: boolean;
  equipamentos: string[];
  programaSiconv: string | null;
  programaTransfereGovNome: string | null;
  valorPagoFornecedor: number | null;
  pagamentosCount: number;
}) {
  const pctDesembolsado = c.financeiro.global && c.financeiro.desembolsado != null
    ? Math.round((c.financeiro.desembolsado / c.financeiro.global) * 100)
    : null;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{
              fontSize: 11.5, fontWeight: 700, color: colors.primary, background: colors.primaryLight,
              padding: '2px 9px', borderRadius: 5, fontFamily: 'monospace',
            }}>
              Convênio {c.numero}
            </span>
            {c.numeroInstrumento && <span style={{ fontSize: 11, color: colors.subtleText, fontFamily: 'monospace' }}>{c.numeroInstrumento}</span>}
            {monitorado && (
              <span style={{ fontSize: 10, fontWeight: 700, color: colors.hiperGreen, background: colors.hiperGreenBg, padding: '2px 7px', borderRadius: 20 }}>
                ● Monitorado internamente
              </span>
            )}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: colors.primaryDark }}>{c.convenente.nome}</div>
          <div style={{ fontSize: 12, color: colors.mutedText, marginTop: 2 }}>
            {c.convenente.cnpj} · {c.municipio}/{c.uf}
          </div>
          {/* Equipamento em destaque -- pedido direto do usuario (2026-09-08):
              e o dado que motiva a pagina inteira, precisa aparecer antes de
              qualquer clique, nao so dentro do plano de aplicacao do SICONV
              (camada 2). Ver equipamentoTags.ts pro casamento. */}
          {equipamentos.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {equipamentos.map((e) => (
                <span key={e} style={{
                  fontSize: 13, fontWeight: 800, color: colors.primaryDark, background: colors.surface,
                  border: `1px solid ${colors.border}`, padding: '4px 11px', borderRadius: 20,
                }}>
                  {e}
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          <StatusPill texto={c.situacao} />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: colors.mutedText, textTransform: 'uppercase' }}>Valor global</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: colors.primaryDark }}>{fmtMoeda(c.financeiro.global)}</div>
            {pctDesembolsado !== null && <div style={{ fontSize: 10.5, color: colors.mutedText }}>{pctDesembolsado}% desembolsado</div>}
          </div>
        </div>
      </div>

      {/* Programa em destaque na camada 1 -- e o dado que classifica o
          convenio dentro da politica de financiamento. */}
      <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: '12px 0 0', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '8px 10px' }}>
        <strong style={{ color: colors.mutedText, fontSize: 10.5, textTransform: 'uppercase', marginRight: 4 }}>Programa:</strong>
        {programaSiconv || programaTransfereGovNome || '— (não encontrado em nenhuma fonte)'}
      </p>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10,
        marginTop: 12, padding: '10px 12px', background: colors.surface, borderRadius: 8,
      }}>
        <Campo label="Valor global">{fmtMoeda(c.financeiro.global)}</Campo>
        <Campo label="Valor repasse" legenda={pct(c.financeiro.repasse, c.financeiro.global, 'do global')}>{fmtMoeda(c.financeiro.repasse)}</Campo>
        <Campo label="Contrapartida">{fmtMoeda(c.financeiro.contrapartida)}</Campo>
        <Campo label="Saldo em conta">{fmtMoeda(c.financeiro.saldoConta)}</Campo>
        <Campo label="Última liberação" legenda={fmtData(c.datas.ultimaLiberacao) !== '—' ? fmtData(c.datas.ultimaLiberacao) : undefined}>
          {fmtMoeda(c.financeiro.ultimaLiberacaoValor)}
        </Campo>
        <Campo label="Valor pago ao fornecedor" legenda={pagamentosCount ? `${pagamentosCount} pagamento(s)` : undefined}>
          {fmtMoeda(valorPagoFornecedor)}
        </Campo>
      </div>
      {!c.financeiro.fonteConfiavel && (
        <p style={{ fontSize: 11, color: colors.logoOrange, margin: '8px 0 0' }}>
          ⚠️ Não encontrado no dump SICONV — valores acima vêm do Portal da Transparência, que tem bug de truncamento
          conhecido nesse campo. Conferir manualmente.
        </p>
      )}
    </>
  );
}
