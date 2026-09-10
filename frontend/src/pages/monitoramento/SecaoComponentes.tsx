/** Levantamento nacional por "componente" de financiamento oncologico
 * (REDE DE ATENCAO.../Politica Nacional de Prevencao e Controle do Cancer),
 * via `programa`+`proposta` do TransfereGov -- ver
 * backend/scripts/levantamento_convenios_oncologia.py. Diferente do resto
 * da pagina: nao e por numero de convenio (FAF SAUDE e instrumento novo,
 * sem numero legado), entao fica como secao separada, nao dentro do
 * ConvenioCard -- fica na sua propria aba na pagina principal (ver
 * MonitoramentoEquipamentosPage.tsx), nao misturado com a lista de
 * convenios. Fase de descoberta pra equipe tecnica avaliar (2026-09-08)
 * -- so achado ate agora tem proposta em 2025; 2026 existe como `programa`
 * mas sem proposta ainda, e 2024 ("REDE DE ATENCAO...") nao tem `programa`
 * equivalente em nenhuma API (documentado no script). */
import { colors } from '../../styles/tokens';
import { fmtMoeda } from './format';
import type { ComponenteOncologia } from './types';
import { Campo, estiloCard, Secao, StatusPill } from './ui';

export function SecaoComponentes({ dados }: { dados: ComponenteOncologia[] }) {
  const totalPropostas = dados.reduce((a, c) => a + c.total_propostas, 0);

  return (
    <div>
      <p style={{ color: colors.mutedText, fontSize: 12.5, maxWidth: 900, lineHeight: 1.6, marginBottom: 16 }}>
        Isto é um <strong>radar nacional de propostas</strong>, não a lista de convênios já assinados (essa fica na
        aba "Convênios"). Cada bloco abaixo é um dos 8 componentes oficiais do PNPCC/Rede de Atenção num ano
        específico; dentro dele, as "propostas" são pedidos de financiamento que qualquer ente (prefeitura,
        hospital) submeteu pra aquele programa no TransfereGov — podem ainda nem ter virado convênio (ex.: situação
        "Aprovada" é etapa anterior a "convênio assinado"). É útil pra achar convênios novos que ainda não têm
        número TransfereGov legado — foi assim que os registros FAF/TED sem número de convênio foram encontrados.
      </p>
      <p style={{ color: colors.mutedText, fontSize: 12.5, maxWidth: 900, lineHeight: 1.6, marginBottom: 16 }}>
        Casamento por nome normalizado do <code>programa</code> contra os 8 componentes pedidos —{' '}
        <code>id_programa</code> muda todo ano que a categoria é recriada, revalidar anualmente. Fase de descoberta:{' '}
        {totalPropostas} proposta(s) encontrada(s) em {dados.length} combinação(ões) componente/ano.
      </p>

      {dados.length === 0 ? (
        <p style={{ fontSize: 12, color: colors.mutedText, fontStyle: 'italic' }}>Nenhum componente batendo ainda.</p>
      ) : (
        dados.map((c) => (
          <details key={`${c.componente}-${c.ano_programa}`} style={{ ...estiloCard, marginBottom: 10 }}>
            <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{c.componente}</div>
                <div style={{ fontSize: 11, color: colors.mutedText, marginTop: 2 }}>
                  Ano {c.ano_programa} · programa #{c.id_programa} · nome na API: "{c.nm_programa_api}"
                </div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: colors.primary }}>{c.total_propostas} proposta(s)</span>
            </summary>

            {c.propostas.length === 0 ? (
              <p style={{ fontSize: 12, color: colors.mutedText, fontStyle: 'italic', marginTop: 10 }}>
                Categoria existe no TransfereGov, mas sem proposta submetida ainda.
              </p>
            ) : (
              <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                {c.propostas.map((p) => (
                  <div key={p.id_proposta} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 12.5 }}>{p.ente_recebedor || '—'}</strong>
                      <StatusPill texto={p.situacao_proposta} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginTop: 8 }}>
                      <Campo label="CNPJ">{p.cnpj || '—'}</Campo>
                      <Campo label="Município/UF">{p.municipio}/{p.uf}</Campo>
                      <Campo label="Valor planejado">{fmtMoeda(p.valor_planejamento)}</Campo>
                      <Campo label="Proposta">#{p.id_proposta}</Campo>
                    </div>
                    {p.ds_objeto && <p style={{ fontSize: 12, marginTop: 8, color: colors.mutedText }}>{p.ds_objeto}</p>}
                  </div>
                ))}
              </div>
            )}
          </details>
        ))
      )}

      <Secao titulo="Nota de escopo">
        <p style={{ fontSize: 11.5, color: colors.mutedText, lineHeight: 1.6 }}>
          Além disso, o mesmo levantamento achou 1.689 propostas em programas Pronon/Pronas (mesmo domínio de
          financiamento oncológico/deficiência, mas fora dos 8 componentes literais pedidos) — não incluídas aqui de
          propósito, disponíveis em <code>backend/scripts/output/radar_pronon_pronas.csv</code> pra quem quiser
          revisar à parte.
        </p>
      </Secao>
    </div>
  );
}
