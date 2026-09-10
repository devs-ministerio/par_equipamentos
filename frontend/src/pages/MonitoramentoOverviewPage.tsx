/**
 * Pagina de overview do monitoramento interno -- INDEPENDENTE (achado
 * 2026-09-09, pedido do usuario: "quero que seja independente, não mostrar
 * apenas quando abrir um convênio especifico"). Antes so existia a pagina
 * de DETALHE de 1 instrumento (MonitoramentoInstrumentoPage.tsx); esta e
 * o indice/dashboard que reune todos os instrumentos monitorados (105+ a
 * partir da planilha real da equipe, ver
 * backend/scripts/importar_planilha_monitoramento.py).
 *
 * KPIs/listas vem de 2 fontes, igual o resto do monitoramento interno:
 *   - `/monitoramento/resumo` (backend, NOSSO schema -- instrumento/
 *     evento/acao) pra tudo que e dado de gestao interna.
 *   - siconv.json (estatico, mesmo arquivo que a pagina principal usa) so
 *     pra "equipamentos com pagamento ao fornecedor" -- essa info vem do
 *     SICONV, nao faz sentido o router de monitoramento interno ler um
 *     JSON de outro pipeline.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KpiCard } from '../components/dashboard/KpiCard';
import { colors, layout } from '../styles/tokens';
import { API_BASE_URL } from './monitoramento/api';
import { fmtData } from './monitoramento/format';
import type { SiconvEntrada } from './monitoramento/types';
import { type ContagemRotulo, BarraDistribuicao, estiloCard } from './monitoramento/ui';
import { useJson } from './monitoramento/useJson';

type InauguracaoApi = {
  nr_convenio: string;
  nome_convenente: string;
  data: string;
  realizada: boolean;
  dias: number;
};

type ResumoApi = {
  total_instrumentos: number;
  pct_execucao_fisica_medio: number | null;
  distribuicao_fase: ContagemRotulo[];
  licencas_cnen_deferidas: number;
  por_tecnico_titular: ContagemRotulo[];
  inauguracoes: InauguracaoApi[];
  nr_convenios: string[];
};

type InstrumentoApi = {
  nr_convenio: string;
  nome_convenente: string;
  municipio: string | null;
  uf: string | null;
  tecnico_titular: string | null;
};

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Linha do tempo de inaugurações -- achado 2026-09-09, 2a rodada (pedido
 * do usuario: "pensei em dashboards por mês tipo uma linha do tempo com
 * os anos, e ao passar o mouse a lista"). 1 linha por ano, 12 células
 * (Jan-Dez); célula solida = ja tem inauguração REALIZADA naquele mês,
 * contorno = so PREVISTA; hover mostra a lista daquele mês num tooltip
 * (substitui a lista sempre visivel por uma visao compacta com detalhe
 * sob demanda). So CSS/estado local, sem lib de grafico nova. */
function LinhaDoTempoInauguracoes({ itens }: { itens: InauguracaoApi[] }) {
  const [hover, setHover] = useState<string | null>(null);

  if (itens.length === 0) {
    return <p style={{ fontSize: 12, color: colors.mutedText, fontStyle: 'italic' }}>Nenhuma inauguração registrada ainda.</p>;
  }

  const porAnoMes = new Map<string, InauguracaoApi[]>();
  for (const i of itens) {
    const d = new Date(i.data + 'T00:00:00');
    const chave = `${d.getFullYear()}-${d.getMonth()}`;
    if (!porAnoMes.has(chave)) porAnoMes.set(chave, []);
    porAnoMes.get(chave)!.push(i);
  }
  const anos = [...new Set(itens.map((i) => new Date(i.data + 'T00:00:00').getFullYear()))].sort();

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {anos.map((ano) => (
        <div key={ano}>
          <div style={{ fontSize: 12, fontWeight: 700, color: colors.primary, marginBottom: 6 }}>{ano}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4 }}>
            {MESES_ABREV.map((mes, idx) => {
              const chave = `${ano}-${idx}`;
              const doMes = porAnoMes.get(chave) ?? [];
              const temRealizada = doMes.some((i) => i.realizada);
              const temPrevista = doMes.some((i) => !i.realizada);
              return (
                <div key={mes} style={{ position: 'relative' }} onMouseEnter={() => doMes.length && setHover(chave)} onMouseLeave={() => setHover(null)}>
                  <div
                    style={{
                      height: 34, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, cursor: doMes.length ? 'pointer' : 'default',
                      background: temRealizada ? colors.hiperGreen : temPrevista ? '#fff' : colors.surface,
                      border: temPrevista && !temRealizada ? `1.5px dashed ${colors.primary}` : temRealizada ? 'none' : `1px solid ${colors.border}`,
                      color: temRealizada ? '#fff' : temPrevista ? colors.primary : colors.mutedText,
                    }}
                  >
                    {mes}{doMes.length > 1 && ` ×${doMes.length}`}
                  </div>
                  {hover === chave && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, zIndex: 10, marginTop: 4,
                      background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 8, padding: 8,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 240, display: 'grid', gap: 6,
                    }}>
                      {doMes.map((i) => (
                        <Link
                          key={i.nr_convenio}
                          to={`/monitoramento-equipamentos/instrumentos/${i.nr_convenio}`}
                          style={{ fontSize: 11.5, textDecoration: 'none', color: 'inherit', display: 'block' }}
                        >
                          <strong style={{ color: colors.primary }}>{fmtData(i.data)}</strong> — {i.nome_convenente} ({i.nr_convenio})
                          {i.realizada ? ' ✓' : (
                            <span style={{ color: i.dias < 0 ? colors.logoOrange : colors.mutedText }}>
                              {' '}({i.dias < 0 ? `atrasada ${Math.abs(i.dias)}d` : `em ${i.dias}d`})
                            </span>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MonitoramentoOverviewPage() {
  const [resumo, setResumo] = useState<ResumoApi | null>(null);
  const [instrumentos, setInstrumentos] = useState<InstrumentoApi[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { dados: siconvTodos } = useJson<SiconvEntrada[]>('/monitoramento-equipamentos/siconv.json');

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE_URL}/monitoramento/resumo`).then((r) => r.json()),
      fetch(`${API_BASE_URL}/monitoramento/instrumentos`).then((r) => r.json()),
    ])
      .then(([r, i]) => { setResumo(r); setInstrumentos(i); })
      .catch((e) => setErro(String(e)));
  }, []);

  // Equipamentos com pagamento ao fornecedor -- cruza com siconv.json (a
  // mesma fonte que a aba Fornecedores do card usa), nunca fica no
  // backend de monitoramento interno (ver docstring do arquivo).
  const comPagamento = (() => {
    if (!resumo || !siconvTodos) return null;
    const siconvPorNumero = new Map(siconvTodos.map((e) => [e.convenio.NR_CONVENIO, e]));
    return resumo.nr_convenios.filter((nr) => (siconvPorNumero.get(nr)?.pagamentos.length ?? 0) > 0).length;
  })();

  if (erro) return <p style={{ padding: layout.pagePadding, color: colors.hipoRed }}>Erro ao carregar: {erro}</p>;
  if (!resumo || !instrumentos) {
    return <p style={{ padding: layout.pagePadding, color: colors.mutedText }}>Carregando...</p>;
  }

  // "Equipamentos previstos {ano}/{ano+1}" -- achado 2026-09-09, 2a
  // rodada (pedido do usuario, base = previsão de inauguração, decisão
  // confirmada em AskUserQuestion). Ano calculado, nunca hardcoded --
  // continua correto sem precisar de ajuste manual em anos futuros.
  const anoAtual = new Date().getFullYear();
  const previstosPorAno = (ano: number) =>
    resumo.inauguracoes.filter((i) => new Date(i.data + 'T00:00:00').getFullYear() === ano).length;

  return (
    <div style={{ minHeight: '100vh', background: colors.surface, padding: layout.pagePadding }}>
      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: colors.subtleText, marginBottom: 6 }}>
          Ministério da Saúde <span style={{ margin: '0 4px' }}>›</span>{' '}
          <Link to="/monitoramento-equipamentos" style={{ color: colors.subtleText, textDecoration: 'none' }}>DECAN / FNS</Link>{' '}
          <span style={{ margin: '0 4px' }}>›</span> <span style={{ color: colors.primary }}>Monitoramento de Instrumentos</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em', margin: '0 0 6px', color: colors.primary }}>
            Monitoramento Interno — Visão Geral
          </h1>
          <Link
            to="/monitoramento-equipamentos/painel"
            style={{ fontSize: 12.5, fontWeight: 600, color: colors.primary, textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            Ver painel de gestão →
          </Link>
        </div>
        <p style={{ color: colors.mutedText, fontSize: 13, maxWidth: 900, lineHeight: 1.6, marginBottom: 20 }}>
          Acompanhamento manual pós-repasse de {resumo.total_instrumentos} instrumento(s) — dado importado da planilha
          real da equipe (<code>backend/scripts/importar_planilha_monitoramento.py</code>). Financeiro/identificação
          continuam na <Link to="/monitoramento-equipamentos" style={{ color: colors.primary }}>lista principal de convênios</Link>.
        </p>

        <div style={{ display: 'flex', gap: layout.cardGap, flexWrap: 'wrap', marginBottom: 20 }}>
          <KpiCard label="Instrumentos monitorados" value={resumo.total_instrumentos} color={colors.primary} />
          <KpiCard
            label="Execução física média"
            value={resumo.pct_execucao_fisica_medio != null ? `${Math.round(resumo.pct_execucao_fisica_medio * 100)}%` : '—'}
            color={colors.primaryDark}
          />
          <KpiCard label="Licenças CNEN deferidas" value={resumo.licencas_cnen_deferidas} color={colors.hiperGreen} />
          <KpiCard label="Equipamentos com pagamento" value={comPagamento ?? '...'} color={colors.hiperGreen} />
          <KpiCard label={`Equipamentos previstos ${anoAtual}`} value={previstosPorAno(anoAtual)} color={colors.logoOrange} />
          <KpiCard label={`Equipamentos previstos ${anoAtual + 1}`} value={previstosPorAno(anoAtual + 1)} color={colors.logoOrange} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
          <div style={estiloCard}>
            <strong style={{ fontSize: 13 }}>Distribuição por fase</strong>
            <div style={{ marginTop: 10 }}>
              <BarraDistribuicao itens={resumo.distribuicao_fase} corBarra={colors.primary} />
            </div>
          </div>
          <div style={estiloCard}>
            <strong style={{ fontSize: 13 }}>Instrumentos por técnico titular</strong>
            <div style={{ marginTop: 10 }}>
              <BarraDistribuicao itens={resumo.por_tecnico_titular} corBarra={colors.hiperGreen} />
            </div>
          </div>
        </div>

        <div style={{ ...estiloCard, marginBottom: 20 }}>
          <strong style={{ fontSize: 13 }}>Inaugurações (real ou prevista)</strong>
          <div style={{ marginTop: 10 }}>
            <LinhaDoTempoInauguracoes itens={resumo.inauguracoes} />
          </div>
        </div>

        <div style={estiloCard}>
          <strong style={{ fontSize: 13 }}>Instrumentos monitorados ({instrumentos.length})</strong>
          <div style={{ marginTop: 10, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: colors.mutedText, fontSize: 11, textTransform: 'uppercase' }}>
                  <th style={{ padding: '4px 8px' }}>Convênio</th>
                  <th style={{ padding: '4px 8px' }}>Convenente</th>
                  <th style={{ padding: '4px 8px' }}>UF/Município</th>
                  <th style={{ padding: '4px 8px' }}>Técnico titular</th>
                </tr>
              </thead>
              <tbody>
                {instrumentos.map((i) => (
                  <tr key={i.nr_convenio} style={{ borderTop: `1px solid ${colors.border}` }}>
                    <td style={{ padding: '6px 8px' }}>
                      <Link to={`/monitoramento-equipamentos/instrumentos/${i.nr_convenio}`} style={{ color: colors.primary, textDecoration: 'none', fontWeight: 600 }}>
                        {i.nr_convenio}
                      </Link>
                    </td>
                    <td style={{ padding: '6px 8px' }}>{i.nome_convenente}</td>
                    <td style={{ padding: '6px 8px' }}>{i.uf}/{i.municipio}</td>
                    <td style={{ padding: '6px 8px' }}>{i.tecnico_titular ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
