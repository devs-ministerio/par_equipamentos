import { colors } from '@/styles/tokens';
import type { EstadoResumo } from '@/hooks/usePainelGeralResumos';
import { PainelGeralStatCard } from './painel-geral-stat-card';
import { PainelGeralSubCard } from './painel-geral-sub-card';
import { PainelGeralRankingMacros } from './painel-geral-ranking-macros';
import { PainelGeralBarraNaturezaJuridica } from './painel-geral-barra-natureza-juridica';

export function PainelGeralCardFamilia({
  resumo,
  rotulo,
  onEntrar,
}: {
  resumo: EstadoResumo;
  rotulo: string;
  onEntrar: () => void;
}) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 14,
        padding: '24px 26px',
        width: '100%',
        boxSizing: 'border-box',
        borderTop: `3px solid ${colors.primary}`,
        boxShadow: '0 1px 2px rgba(22, 33, 62, 0.04), 0 4px 16px rgba(22, 33, 62, 0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      <div style={{ fontSize: 17, fontWeight: 800, color: '#16213e', letterSpacing: '-0.01em' }}>{rotulo}</div>

      {resumo === 'carregando' && <div style={{ fontSize: 12.5, color: colors.subtleText }}>Carregando...</div>}
      {resumo === 'erro' && (
        <div style={{ fontSize: 12.5, color: colors.hipoRed }}>Não foi possível carregar o resumo desta família.</div>
      )}
      {typeof resumo === 'object' && (
        <>
          <div style={{ display: 'flex', gap: 24 }}>
            <div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#16213e' }}>{resumo.totalSus.toLocaleString('pt-BR')}</div>
              <div style={{ fontSize: 11, color: colors.subtleText, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                Equipamentos em uso SUS
              </div>
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 700, color: colors.mutedText }}>
                {resumo.totalGeral.toLocaleString('pt-BR')}
              </div>
              <div style={{ fontSize: 11, color: colors.subtleText, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                Total Equipamentos
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <PainelGeralStatCard valor={`${resumo.macrosHipo} de ${resumo.macrosTotal}`} label="Macrorregiões hipossuficientes" />
            <PainelGeralStatCard
              valor={`${resumo.regioesHipo} de ${resumo.regioesTotal}`}
              label="Regiões de saúde hipossuficientes"
            />
            <PainelGeralStatCard valor={String(resumo.municipiosHipo)} label="Municípios hipossuficientes (≥100 mil hab.)" />
          </div>

          <PainelGeralSubCard titulo="Hipossuficientes por região">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {resumo.porRegiao.map((r) => (
                <div key={r.regiao} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                  <span style={{ width: 78, color: '#475066', flexShrink: 0 }}>{r.regiao}</span>
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#e4e7ee', overflow: 'clip' }}>
                    {r.total > 0 && (
                      <div
                        style={{
                          height: '100%',
                          width: `${(r.hipo / r.total) * 100}%`,
                          background: colors.hipoRed,
                        }}
                      />
                    )}
                  </div>
                  <span style={{ width: 40, textAlign: 'right', color: colors.subtleText, flexShrink: 0 }}>
                    {r.hipo}/{r.total}
                  </span>
                </div>
              ))}
            </div>
          </PainelGeralSubCard>

          <PainelGeralSubCard titulo="Ranking de macrorregiões">
            <PainelGeralRankingMacros hipo={resumo.top5Hipo} hiper={resumo.top5Hiper} />
          </PainelGeralSubCard>

          {resumo.naturezaJuridica.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: colors.subtleText,
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                  marginBottom: 6,
                }}
              >
                Natureza jurídica da oferta SUS
              </div>
              <PainelGeralBarraNaturezaJuridica dados={resumo.naturezaJuridica} />
            </div>
          )}
        </>
      )}

      <button
        onClick={onEntrar}
        style={{
          marginTop: 4,
          alignSelf: 'flex-start',
          padding: '8px 16px',
          borderRadius: 8,
          fontSize: 12.5,
          fontWeight: 700,
          cursor: 'pointer',
          border: 'none',
          background: colors.primary,
          color: '#fff',
        }}
      >
        Ver painel completo →
      </button>
    </div>
  );
}
