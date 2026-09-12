import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppHeader } from '../components/layout/app-header';
import { MacroMap } from '@/components/features/macro-map';
import { PainelGeralSecao } from '@/components/features/painel-geral-secao';
import { PainelGeralCardFamilia } from '@/components/features/painel-geral-card-familia';
import { usePainelGeralResumos } from '@/hooks/usePainelGeralResumos';
import { useMacroGeojson } from '@/hooks/useMacroGeojson';
import { CHAVE_STORAGE_FAMILIA } from '../context/familia-equipamento-context';
import { EQUIPAMENTOS, getEquipamento } from '../data/constants';
import { colors, layout } from '../styles/tokens';

function irParaEquipamentos(
  navigate: ReturnType<typeof useNavigate>,
  familia: string,
  destino: 'dashboard' | 'mapa' | 'relatorios',
) {
  try {
    localStorage.setItem(CHAVE_STORAGE_FAMILIA, familia);
  } catch {
    // ignora -- privada/bloqueado, so perde a conveniencia de pre-selecionar
  }
  navigate(`/${destino}`);
}

/**
 * Pagina inicial do sistema (decisao 2026-08-22) -- visao geral de TODAS as
 * familias de equipamento com dado real hoje, antes de entrar no painel
 * detalhado (Dashboard/Mapa/Relatorios) de uma familia especifica. Fica FORA
 * do AppLayout/TopNav de proposito -- essa pagina nao pertence a nenhuma
 * familia especifica (nao precisa do FamiliaEquipamentoProvider), e o
 * TopNav (Geral/Mapa/Relatorios + seletor de familia) so faz sentido depois
 * que o usuario escolheu uma. Navegar pra dentro (/dashboard, /mapa) grava a
 * familia escolhida na mesma chave de localStorage que o
 * FamiliaEquipamentoContext ja usa, entao a pagina de destino abre direto
 * nela.
 *
 * Busca o resumo (totais + hipo) de cada familia `disponivel` em paralelo,
 * na carga -- e o mesmo dado que DashboardPage mostra filtrado, so que sem
 * filtro (visao nacional). Familias `disponivel: false` aparecem so como
 * "Em breve" (mesma fonte de verdade que TopNav/SeletorEquipamento usa),
 * sem tentar buscar dado que nao existe ainda. Migrado pra `useQueries`/
 * `useMacroGeojson` (2026-09-11) -- antes usava `useEffect`+`setState` manual
 * com guarda `cancelado`.
 */
export function PainelGeralPage() {
  const navigate = useNavigate();
  const familiasDisponiveis = useMemo(() => EQUIPAMENTOS.filter((eq) => eq.disponivel), []);

  const resumos = usePainelGeralResumos(familiasDisponiveis.map((eq) => eq.familia));
  const geoQuery = useMacroGeojson();
  const [familiaMapa, setFamiliaMapa] = useState(familiasDisponiveis[0]?.familia ?? 'TOMOGRAFO');

  const resumoMapa = resumos[familiaMapa];
  const macrosMapa = typeof resumoMapa === 'object' ? resumoMapa.macros : [];
  const coberturaRowsMapa = typeof resumoMapa === 'object' ? resumoMapa.coberturaRows : [];

  return (
    <div style={{ minHeight: '100vh', background: colors.surface, color: colors.primaryDark, fontSize: 14 }}>
      {/* Painel Geral e a pagina inicial (fora de AppLayout/MonitoramentoLayout
          de proposito) -- sem itens de nav, so a logo do header unificado. */}
      <AppHeader navItems={[]} />
      <div style={{ padding: layout.pagePadding, maxWidth: layout.maxWidth, margin: '0 auto' }}>
        {/* Hero */}
        <div
          style={{
            background: colors.primary,
            borderRadius: 12,
            padding: '36px 40px',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.75 }}>
            DECAN · Ministério da Saúde
          </div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>SIGEO — Sistema de Gestão de Equipamentos em Oncologia</div>
        </div>

        {/* Resumo por familia */}
        <PainelGeralSecao titulo="Cobertura por Equipamento">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: 20 }}>
            {familiasDisponiveis.map((eq) => (
              <PainelGeralCardFamilia
                key={eq.familia}
                rotulo={eq.rotulo}
                resumo={resumos[eq.familia] ?? 'carregando'}
                onEntrar={() => irParaEquipamentos(navigate, eq.familia, 'dashboard')}
              />
            ))}
          </div>
        </PainelGeralSecao>

        {/* Mapa nacional */}
        <PainelGeralSecao titulo="Mapa nacional" subtitulo="Cobertura por macrorregião de saúde, coloreada por Hipo/Hiperssuficiência.">
          <div style={{ background: '#fff', borderRadius: 10, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {familiasDisponiveis.map((eq) => (
                  <button
                    key={eq.familia}
                    onClick={() => setFamiliaMapa(eq.familia)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: `1.5px solid ${familiaMapa === eq.familia ? colors.primary : colors.border}`,
                      background: familiaMapa === eq.familia ? colors.primaryLight : '#fff',
                      color: familiaMapa === eq.familia ? colors.primary : '#475066',
                    }}
                  >
                    {eq.rotulo}
                  </button>
                ))}
              </div>
              <button
                onClick={() => irParaEquipamentos(navigate, familiaMapa, 'mapa')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: `1px solid ${colors.border}`,
                  background: '#fff',
                  color: colors.primary,
                }}
              >
                Ver mapa completo →
              </button>
            </div>

            <div style={{ marginTop: 14 }}>
              {geoQuery.data && macrosMapa.length > 0 ? (
                <MacroMap
                  geo={geoQuery.data}
                  macros={macrosMapa}
                  coberturaRows={coberturaRowsMapa}
                  produtividade={getEquipamento(familiaMapa).produtividade}
                  onSelectMacro={() => {}}
                />
              ) : (
                <div style={{ padding: 60, textAlign: 'center', color: colors.subtleText }}>Carregando mapa...</div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 14, flexWrap: 'wrap' }}>
              {/* Mesma logica de MacroMap.tsx::escalaCor -- duas gradacoes
                  com corte duro em 100% (dois stops na mesma posicao),
                  nao mais um gradiente unico atravessando a meta. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 140,
                    height: 8,
                    borderRadius: 4,
                    background: `linear-gradient(to right, ${colors.hipoRed} 0%, ${colors.hipoRedBg} 50%, ${colors.hiperGreenBg} 50%, ${colors.hiperGreen} 100%)`,
                  }}
                />
                <span style={{ fontSize: 11, color: colors.subtleText }}>0x ── 1x ── 2x+</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: colors.hipoRed }} />
                <span style={{ fontSize: 11.5, color: '#475066' }}>
                  <strong style={{ color: colors.hipoRed }}>Hipossuficiente</strong> -- abaixo de 1x
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: colors.hiperGreen }} />
                <span style={{ fontSize: 11.5, color: '#475066' }}>
                  <strong style={{ color: colors.hiperGreen }}>Hiperssuficiente</strong> -- 1x ou mais
                </span>
              </div>
            </div>
          </div>
        </PainelGeralSecao>

        {/* Metodologia (teaser) */}
        <PainelGeralSecao titulo="Como a suficiência é calculada">
          <div style={{ background: '#fff', borderRadius: 10, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ fontSize: 13, color: colors.mutedText, lineHeight: 1.7, maxWidth: 640 }}>
              Cada macrorregião, região de saúde ou município recebe um <strong>coeficiente</strong>, comparando a
              quantidade de equipamentos em uso SUS com a demanda estimada da população SUS-dependente. Abaixo de 1x é{' '}
              <strong>Hipossuficiente</strong>; 1x ou mais é <strong>Hiperssuficiente</strong>. Os parâmetros de
              cada equipamento estão detalhados na Metodologia completa.
            </div>
            <button
              onClick={() => irParaEquipamentos(navigate, familiasDisponiveis[0]?.familia ?? 'TOMOGRAFO', 'relatorios')}
              style={{
                padding: '9px 18px',
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
                border: `1px solid ${colors.border}`,
                background: '#fff',
                color: colors.primary,
                whiteSpace: 'nowrap',
              }}
            >
              Ver metodologia completa →
            </button>
          </div>
        </PainelGeralSecao>

        <div style={{ height: 40 }} />
      </div>
    </div>
  );
}
