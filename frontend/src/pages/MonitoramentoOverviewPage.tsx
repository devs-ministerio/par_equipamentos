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
import { estiloCard } from './monitoramento/ui';
import { useJson } from './monitoramento/useJson';

type ContagemRotulo = { rotulo: string; quantidade: number };

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
  acoes_pendentes: number;
  acoes_atrasadas: number;
  nr_convenios: string[];
};

type InstrumentoApi = {
  nr_convenio: string;
  nome_convenente: string;
  municipio: string | null;
  uf: string | null;
  tecnico_titular: string | null;
};

type AcaoApi = {
  id: number;
  nr_convenio: string;
  descricao: string;
  data_prevista: string | null;
  data_conclusao: string | null;
  responsavel: string | null;
};

/** Barra horizontal simples (sem lib de grafico -- so CSS, mais leve) pra
 * distribuição por fase/técnico. */
function BarraDistribuicao({ itens, corBarra }: { itens: ContagemRotulo[]; corBarra: string }) {
  const max = Math.max(1, ...itens.map((i) => i.quantidade));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {itens.map((item) => (
        <div key={item.rotulo}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
            <span>{item.rotulo}</span>
            <strong>{item.quantidade}</strong>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: colors.surface }}>
            <div style={{ height: '100%', borderRadius: 999, width: `${(item.quantidade / max) * 100}%`, background: corBarra }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MonitoramentoOverviewPage() {
  const [resumo, setResumo] = useState<ResumoApi | null>(null);
  const [instrumentos, setInstrumentos] = useState<InstrumentoApi[] | null>(null);
  const [acoesPendentes, setAcoesPendentes] = useState<AcaoApi[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { dados: siconvTodos } = useJson<SiconvEntrada[]>('/monitoramento-equipamentos/siconv.json');

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE_URL}/monitoramento/resumo`).then((r) => r.json()),
      fetch(`${API_BASE_URL}/monitoramento/instrumentos`).then((r) => r.json()),
      fetch(`${API_BASE_URL}/monitoramento/acoes?pendentes=true`).then((r) => r.json()),
    ])
      .then(([r, i, a]) => { setResumo(r); setInstrumentos(i); setAcoesPendentes(a); })
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
  if (!resumo || !instrumentos || !acoesPendentes) {
    return <p style={{ padding: layout.pagePadding, color: colors.mutedText }}>Carregando...</p>;
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const acoesAtrasadas = acoesPendentes.filter((a) => a.data_prevista && a.data_prevista < hoje);
  const acoesProximas = acoesPendentes.filter((a) => !a.data_prevista || a.data_prevista >= hoje);

  return (
    <div style={{ minHeight: '100vh', background: colors.surface, padding: layout.pagePadding }}>
      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: colors.subtleText, marginBottom: 6 }}>
          Ministério da Saúde <span style={{ margin: '0 4px' }}>›</span>{' '}
          <Link to="/monitoramento-equipamentos" style={{ color: colors.subtleText, textDecoration: 'none' }}>DECAN / FNS</Link>{' '}
          <span style={{ margin: '0 4px' }}>›</span> <span style={{ color: colors.primary }}>Monitoramento de Instrumentos</span>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em', margin: '0 0 6px', color: colors.primary }}>
          Monitoramento Interno — Visão Geral
        </h1>
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
          <KpiCard label="Ações pendentes" value={resumo.acoes_pendentes} color={colors.logoOrange} />
          <KpiCard label="Ações atrasadas" value={resumo.acoes_atrasadas} color={resumo.acoes_atrasadas > 0 ? colors.hipoRed : colors.mutedText} />
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
          <div style={estiloCard}>
            <strong style={{ fontSize: 13 }}>Inaugurações (real ou prevista)</strong>
            <div style={{ marginTop: 10, display: 'grid', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
              {resumo.inauguracoes.length === 0 ? (
                <p style={{ fontSize: 12, color: colors.mutedText, fontStyle: 'italic' }}>Nenhuma inauguração registrada ainda.</p>
              ) : resumo.inauguracoes.map((i) => (
                <Link
                  key={i.nr_convenio}
                  to={`/monitoramento-equipamentos/instrumentos/${i.nr_convenio}`}
                  style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, textDecoration: 'none', color: 'inherit' }}
                >
                  <span>
                    <strong style={{ color: colors.primary }}>{fmtData(i.data)}</strong> — {i.nome_convenente} ({i.nr_convenio})
                    {i.realizada && ' ✓'}
                  </span>
                  {!i.realizada && (
                    <span style={{ color: i.dias < 0 ? colors.logoOrange : colors.mutedText, whiteSpace: 'nowrap' }}>
                      {i.dias < 0 ? `atrasada ${Math.abs(i.dias)}d` : `em ${i.dias}d`}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>

          <div style={estiloCard}>
            <strong style={{ fontSize: 13 }}>Pendências (ações por data)</strong>
            <div style={{ marginTop: 10, display: 'grid', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
              {acoesPendentes.length === 0 ? (
                <p style={{ fontSize: 12, color: colors.mutedText, fontStyle: 'italic' }}>Nenhuma ação pendente.</p>
              ) : (
                <>
                  {acoesAtrasadas.map((a) => (
                    <Link key={a.id} to={`/monitoramento-equipamentos/instrumentos/${a.nr_convenio}`} style={{ fontSize: 12, textDecoration: 'none', color: 'inherit' }}>
                      <span style={{ color: colors.hipoRed, fontWeight: 700 }}>⚠️ {fmtData(a.data_prevista)}</span> — {a.descricao} ({a.nr_convenio})
                    </Link>
                  ))}
                  {acoesProximas.map((a) => (
                    <Link key={a.id} to={`/monitoramento-equipamentos/instrumentos/${a.nr_convenio}`} style={{ fontSize: 12, textDecoration: 'none', color: 'inherit' }}>
                      {a.data_prevista ? fmtData(a.data_prevista) : 'sem data'} — {a.descricao} ({a.nr_convenio})
                    </Link>
                  ))}
                </>
              )}
            </div>
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
