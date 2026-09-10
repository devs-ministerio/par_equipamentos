/**
 * Painel de Gestão -- pedido do usuário 2026-09-09, 2a rodada: "crie uma
 * página de painel apenas com dashboards, seja criativo e rico em
 * detalhes, será para avaliação da gestão". Rota
 * `/monitoramento-equipamentos/painel`.
 *
 * Diferença pro Overview (MonitoramentoOverviewPage.tsx): aqui é SÓ
 * dashboard -- nenhuma tabela crua de instrumentos, nenhum form de
 * edição. Reaproveita os mesmos dados já buscados no Overview
 * (`/monitoramento/resumo` + `/monitoramento/instrumentos` +
 * `siconv.json`), sem endpoint novo, montados numa leitura mais
 * executiva: KPIs financeiros, funil de fase, ranking por UF/componente,
 * licenças por vencer.
 *
 * Sem mapa coroplético do Brasil -- não existe geojson por UF no repo
 * hoje (só Bahia/macrorregiões, ver frontend/public/geo/), adicionar um
 * novo ficaria contra a preferência de "opção mais leve" já registrada
 * em memória. Ranking em barra cobre a mesma necessidade sem asset novo.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KpiCard } from '../components/dashboard/KpiCard';
import { colors, layout } from '../styles/tokens';
import { API_BASE_URL } from './monitoramento/api';
import { fmtData, fmtMoeda } from './monitoramento/format';
import type { SiconvEntrada } from './monitoramento/types';
import { type ContagemRotulo, BarraDistribuicao, corValidade, estiloCard } from './monitoramento/ui';
import { useJson } from './monitoramento/useJson';

type InauguracaoApi = { nr_convenio: string; nome_convenente: string; data: string; realizada: boolean; dias: number };
type LicencaVencendoApi = { nr_convenio: string; nome_convenente: string; data_validade: string; dias: number };

type ResumoApi = {
  total_instrumentos: number;
  pct_execucao_fisica_medio: number | null;
  distribuicao_fase: ContagemRotulo[];
  licencas_cnen_deferidas: number;
  licencas_vencendo: LicencaVencendoApi[];
  por_tecnico_titular: ContagemRotulo[];
  inauguracoes: InauguracaoApi[];
  nr_convenios: string[];
};

type InstrumentoApi = {
  nr_convenio: string;
  uf: string | null;
  componente: string | null;
  tipo_contratacao: string | null;
};

type MarcoApi = { id: number; codigo: string; grupo: string; ordem: number | null; rotulo: string };

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Funil de fases -- barras em largura decrescente na ORDEM real do
 * catálogo (Não iniciado → ... → Concluído), não por contagem (achado
 * 2026-09-09: `resumo.distribuicao_fase` vem ordenado por quantidade,
 * bom pro Overview mas esconde ONDE está o gargalo no funil real). */
function FunilFases({ fasesOrdenadas }: { fasesOrdenadas: ContagemRotulo[] }) {
  const total = fasesOrdenadas.reduce((s, f) => s + f.quantidade, 0) || 1;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {fasesOrdenadas.map((f, i) => {
        const pct = f.quantidade / total;
        return (
          <div key={f.rotulo} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 150, fontSize: 11.5, color: colors.mutedText, textAlign: 'right', flexShrink: 0 }}>{f.rotulo}</div>
            <div style={{ flex: 1, background: colors.surface, borderRadius: 6, overflow: 'hidden' }}>
              <div style={{
                width: `${Math.max(pct * 100, f.quantidade > 0 ? 4 : 0)}%`, minHeight: 22,
                background: `linear-gradient(90deg, ${colors.primary}, ${colors.primaryDark})`,
                display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 8px',
                borderTopRightRadius: i === 0 ? 6 : 0, borderBottomRightRadius: 6,
              }}>
                {f.quantidade > 0 && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>{f.quantidade}</span>}
              </div>
            </div>
            <div style={{ width: 40, fontSize: 11, color: colors.mutedText }}>{Math.round(pct * 100)}%</div>
          </div>
        );
      })}
    </div>
  );
}

/** Mesma linha do tempo por ano/mês do Overview -- versão compacta (sem
 * hover, só visual) pra caber num painel com mais blocos por tela. */
function MiniLinhaDoTempo({ itens }: { itens: InauguracaoApi[] }) {
  if (itens.length === 0) return <p style={{ fontSize: 12, color: colors.mutedText, fontStyle: 'italic' }}>Nenhuma inauguração registrada ainda.</p>;
  const porAnoMes = new Map<string, InauguracaoApi[]>();
  for (const i of itens) {
    const d = new Date(i.data + 'T00:00:00');
    const chave = `${d.getFullYear()}-${d.getMonth()}`;
    if (!porAnoMes.has(chave)) porAnoMes.set(chave, []);
    porAnoMes.get(chave)!.push(i);
  }
  const anos = [...new Set(itens.map((i) => new Date(i.data + 'T00:00:00').getFullYear()))].sort();
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {anos.map((ano) => {
        const totalAno = MESES_ABREV.reduce((s, _m, idx) => s + (porAnoMes.get(`${ano}-${idx}`)?.length ?? 0), 0);
        return (
          <div key={ano}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 700, color: colors.primary, marginBottom: 4 }}>
              <span>{ano}</span><span>{totalAno} equipamento(s)</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 3 }}>
              {MESES_ABREV.map((mes, idx) => {
                const doMes = porAnoMes.get(`${ano}-${idx}`) ?? [];
                const temRealizada = doMes.some((i) => i.realizada);
                return (
                  <div key={mes} title={doMes.map((i) => `${i.nome_convenente} (${fmtData(i.data)})`).join('\n') || undefined} style={{
                    height: 26, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8.5, fontWeight: 700,
                    background: temRealizada ? colors.hiperGreen : doMes.length ? '#fff' : colors.surface,
                    border: !temRealizada && doMes.length ? `1.5px dashed ${colors.primary}` : temRealizada ? 'none' : `1px solid ${colors.border}`,
                    color: temRealizada ? '#fff' : doMes.length ? colors.primary : colors.mutedText,
                  }}>
                    {mes[0]}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MonitoramentoPainelPage() {
  const [resumo, setResumo] = useState<ResumoApi | null>(null);
  const [instrumentos, setInstrumentos] = useState<InstrumentoApi[] | null>(null);
  const [marcos, setMarcos] = useState<MarcoApi[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { dados: siconvTodos } = useJson<SiconvEntrada[]>('/monitoramento-equipamentos/siconv.json');

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE_URL}/monitoramento/resumo`).then((r) => r.json()),
      fetch(`${API_BASE_URL}/monitoramento/instrumentos`).then((r) => r.json()),
      fetch(`${API_BASE_URL}/monitoramento/marcos`).then((r) => r.json()),
    ])
      .then(([r, i, m]) => { setResumo(r); setInstrumentos(i); setMarcos(m); })
      .catch((e) => setErro(String(e)));
  }, []);

  // Financeiro -- cruza siconv.json (mesma fonte do Overview/ConvenioCard,
  // nunca no backend de monitoramento interno, ver docstring do arquivo).
  // FAF/TED (chave = NUP SEI) nunca batem aqui de proposito -- nao tem
  // registro no SICONV/TransfereGov, contribuem 0 sem fabricar valor.
  const financeiro = (() => {
    if (!resumo || !siconvTodos) return null;
    const siconvPorNumero = new Map(siconvTodos.map((e) => [e.convenio.NR_CONVENIO, e]));
    let global = 0, pago = 0, comPagamento = 0;
    for (const nr of resumo.nr_convenios) {
      const sc = siconvPorNumero.get(nr);
      if (!sc) continue;
      global += Number(sc.convenio.VL_GLOBAL_CONV) || 0;
      const pagoConvenio = sc.pagamentos.reduce((s, p) => s + (Number((p.VL_PAGO || '0').replace(',', '.')) || 0), 0);
      pago += pagoConvenio;
      if (pagoConvenio > 0) comPagamento += 1;
    }
    return { global, pago, comPagamento, pct: global > 0 ? pago / global : null };
  })();

  if (erro) return <p style={{ padding: layout.pagePadding, color: colors.hipoRed }}>Erro ao carregar: {erro}</p>;
  if (!resumo || !instrumentos || !marcos) {
    return <p style={{ padding: layout.pagePadding, color: colors.mutedText }}>Carregando...</p>;
  }

  // Funil na ordem real do catálogo (nao por contagem). "Não iniciado" vem
  // sempre primeiro -- o backend usa esse MESMO rotulo tanto pro instrumento
  // sem NENHUM evento de fase_geral quanto pro raro marco de catalogo
  // literalmente chamado "Não iniciado" (contagem_fase no resumo conta os
  // 2 casos juntos, ver obter_resumo) -- por isso o marco "Não iniciado" e
  // excluido de `fasesGerais` aqui, senao duplicava a mesma contagem 2x.
  const distribuicaoPorRotulo = new Map(resumo.distribuicao_fase.map((c) => [c.rotulo, c.quantidade]));
  const fasesGerais = marcos
    .filter((m) => m.grupo === 'fase_geral' && m.rotulo !== 'Não iniciado')
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const funil: ContagemRotulo[] = [
    { rotulo: 'Não iniciado', quantidade: distribuicaoPorRotulo.get('Não iniciado') ?? 0 },
    ...fasesGerais.map((f) => ({ rotulo: f.rotulo, quantidade: distribuicaoPorRotulo.get(f.rotulo) ?? 0 })),
  ];

  // Rankings client-side -- mesmo padrao do "comPagamento" do Overview,
  // dado ja vem completo em /monitoramento/instrumentos.
  const contarPor = (campo: 'uf' | 'componente' | 'tipo_contratacao'): ContagemRotulo[] => {
    const c = new Map<string, number>();
    for (const i of instrumentos) {
      const rotulo = i[campo] || 'Não informado';
      c.set(rotulo, (c.get(rotulo) ?? 0) + 1);
    }
    return [...c.entries()].map(([rotulo, quantidade]) => ({ rotulo, quantidade })).sort((a, b) => b.quantidade - a.quantidade);
  };
  const porUf = contarPor('uf').slice(0, 10);
  const porComponente = contarPor('componente');
  const porTipoContratacao = contarPor('tipo_contratacao');

  return (
    <div style={{ minHeight: '100vh', background: colors.surface, padding: layout.pagePadding }}>
      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: colors.subtleText, marginBottom: 6 }}>
          Ministério da Saúde <span style={{ margin: '0 4px' }}>›</span>{' '}
          <Link to="/monitoramento-equipamentos/instrumentos" style={{ color: colors.subtleText, textDecoration: 'none' }}>Monitoramento de Instrumentos</Link>{' '}
          <span style={{ margin: '0 4px' }}>›</span> <span style={{ color: colors.primary }}>Painel de Gestão</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em', margin: '0 0 6px', color: colors.primary }}>
            Painel de Gestão — Equipamentos Oncológicos
          </h1>
          <Link
            to="/monitoramento-equipamentos/instrumentos"
            style={{ fontSize: 12.5, fontWeight: 600, color: colors.primary, textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            ← Ver operacional (por instrumento)
          </Link>
        </div>
        <p style={{ color: colors.mutedText, fontSize: 13, maxWidth: 900, lineHeight: 1.6, marginBottom: 20 }}>
          Visão executiva do acompanhamento pós-repasse de {resumo.total_instrumentos} instrumento(s) — pra avaliação
          da gestão, sem detalhe operacional por convênio (isso fica na{' '}
          <Link to="/monitoramento-equipamentos/instrumentos" style={{ color: colors.primary }}>visão geral</Link>).
        </p>

        {/* KPIs executivos */}
        <div style={{ display: 'flex', gap: layout.cardGap, flexWrap: 'wrap', marginBottom: 20 }}>
          <KpiCard label="Instrumentos monitorados" value={resumo.total_instrumentos} color={colors.primary} />
          <KpiCard
            label="Execução física média"
            value={resumo.pct_execucao_fisica_medio != null ? `${Math.round(resumo.pct_execucao_fisica_medio * 100)}%` : '—'}
            color={colors.primaryDark}
          />
          <KpiCard label="Valor global investido" value={financeiro ? fmtMoeda(financeiro.global) : '...'} color={colors.primary} />
          <KpiCard
            label="Pago ao fornecedor"
            value={financeiro ? `${fmtMoeda(financeiro.pago)}${financeiro.pct != null ? ` (${Math.round(financeiro.pct * 100)}%)` : ''}` : '...'}
            color={colors.hiperGreen}
          />
          <KpiCard
            label="Licenças CNEN deferidas"
            value={`${resumo.licencas_cnen_deferidas}/${resumo.total_instrumentos}`}
            color={colors.hiperGreen}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16, marginBottom: 20 }}>
          <div style={estiloCard}>
            <strong style={{ fontSize: 13 }}>Funil de fases</strong>
            <div style={{ marginTop: 14 }}>
              <FunilFases fasesOrdenadas={funil} />
            </div>
          </div>
          <div style={estiloCard}>
            <strong style={{ fontSize: 13 }}>Inaugurações por ano</strong>
            <div style={{ marginTop: 12 }}>
              <MiniLinhaDoTempo itens={resumo.inauguracoes} />
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 20 }}>
          <div style={estiloCard}>
            <strong style={{ fontSize: 13 }}>Por tipo de contratação</strong>
            <div style={{ marginTop: 10 }}>
              <BarraDistribuicao itens={porTipoContratacao} corBarra={colors.primary} />
            </div>
          </div>
          <div style={estiloCard}>
            <strong style={{ fontSize: 13 }}>Top 10 UF</strong>
            <div style={{ marginTop: 10 }}>
              <BarraDistribuicao itens={porUf} corBarra={colors.hiperGreen} />
            </div>
          </div>
          <div style={estiloCard}>
            <strong style={{ fontSize: 13 }}>Por componente</strong>
            <div style={{ marginTop: 10 }}>
              <BarraDistribuicao itens={porComponente} corBarra={colors.logoOrange} />
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
          <div style={estiloCard}>
            <strong style={{ fontSize: 13 }}>Licenças CNEN por vencer</strong>
            <div style={{ marginTop: 10, display: 'grid', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
              {resumo.licencas_vencendo.length === 0 ? (
                <p style={{ fontSize: 12, color: colors.mutedText, fontStyle: 'italic' }}>Nenhuma licença com validade registrada ainda.</p>
              ) : resumo.licencas_vencendo.map((l) => (
                <Link
                  key={l.nr_convenio}
                  to={`/monitoramento-equipamentos/instrumentos/${l.nr_convenio}`}
                  style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, textDecoration: 'none', color: 'inherit' }}
                >
                  <span><span style={{ width: 8, height: 8, borderRadius: '50%', background: corValidade(l.dias), display: 'inline-block', marginRight: 6 }} />{l.nome_convenente} ({l.nr_convenio})</span>
                  <strong style={{ color: corValidade(l.dias), whiteSpace: 'nowrap' }}>
                    {l.dias < 0 ? `vencida há ${Math.abs(l.dias)}d` : `${l.dias}d`}
                  </strong>
                </Link>
              ))}
            </div>
          </div>
          <div style={estiloCard}>
            <strong style={{ fontSize: 13 }}>Convênios por técnico titular</strong>
            <div style={{ marginTop: 10 }}>
              <BarraDistribuicao itens={resumo.por_tecnico_titular} corBarra={colors.primaryDark} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
