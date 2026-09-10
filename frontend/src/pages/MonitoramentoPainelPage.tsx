/**
 * Painel de Gestão -- pedido do usuário 2026-09-09, 2a rodada: "crie uma
 * página de painel apenas com dashboards, seja criativo e rico em
 * detalhes, será para avaliação da gestão". Rota
 * `/monitoramento-equipamentos/painel`, dentro de `MonitoramentoLayout`
 * (achado 2026-09-10 -- nav propria, ver MonitoramentoTopNav.tsx).
 *
 * Diferença pro Overview (MonitoramentoOverviewPage.tsx): aqui é SÓ
 * dashboard -- nenhuma tabela crua de instrumentos, nenhum form de
 * edição. Reaproveita os mesmos dados já buscados no Overview
 * (`/monitoramento/resumo` + `/monitoramento/instrumentos` +
 * `siconv.json`), sem endpoint novo, montados numa leitura mais
 * executiva: KPIs financeiros, funil de fase, ranking por UF/componente/
 * tipo de equipamento, licenças por vencer.
 *
 * Achado 2026-09-10 (pedido do usuário, 3a rodada: "não temos um gráfico
 * de pizza, barras vertical... os equipamentos achei bem pobre") --
 * pizza (SVG puro) pra tipo de contratação, barras verticais (SVG puro)
 * pro ranking de UF, e um bloco novo de distribuição por TIPO de
 * equipamento (extraído do texto livre `equipamento_descricao`) que não
 * existia antes.
 *
 * Sem mapa coroplético (macrorregião nem UF) -- em stand by por decisão
 * do usuário: vai retomar depois de identificar o CNES de cada
 * convenente (join mais confiável que nome de município por texto).
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { colors, layout } from '@/styles/tokens';
import { normalizarTexto } from '@/utils/texto';
import {
  API_BASE_URL,
  BarraDistribuicao,
  corValidade,
  estiloCard,
  fmtData,
  fmtMoeda,
  useJson,
  type ContagemRotulo,
  type SiconvEntrada,
} from '@/features/monitoramento-equipamento';

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
  equipamento_descricao: string | null;
};

type MarcoApi = { id: number; codigo: string; grupo: string; ordem: number | null; rotulo: string };

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Paleta pra graficos com varias categorias (pizza/barras) -- reaproveita
// os tokens do projeto na ordem, repete se tiver mais categorias que cor.
const PALETA = [colors.primary, colors.hiperGreen, colors.logoOrange, colors.primaryDark, colors.hipoRed, '#8e6fce', '#2aa8b0', '#c9538a'];

/** Extrai a FAMILIA de equipamento (Acelerador Linear, Mamógrafo, etc.) do
 * texto livre `equipamento_descricao` -- achado 2026-09-10 (pedido do
 * usuario: "os equipamentos achei bem pobre e sem criatividade"), esse
 * campo nunca tinha virado uma distribuicao propria antes. Correspondencia
 * por palavra-chave (normalizada, sem acento) contra os nomes ja usados no
 * resto do app (data/constants.ts) + as outras familias reais que aparecem
 * na planilha (Braquiterapia, Endoscopia, Cintilografia/Gama Probe) --
 * nunca inventa categoria nova, so agrupa o que ja esta escrito no dado. */
function extrairFamiliaEquipamento(descricao: string | null): string {
  if (!descricao) return 'Não informado';
  const t = normalizarTexto(descricao);
  if (t.includes('acelerador linear')) return 'Acelerador Linear';
  if (t.includes('mamograf')) return 'Mamógrafo';
  if (t.includes('pet') && t.includes('ct')) return 'PET-CT';
  if (t.includes('tomograf')) return 'Tomógrafo';
  if (t.includes('ressonancia')) return 'Ressonância Magnética';
  if (t.includes('ultrasson') || t.includes('ultrasom')) return 'Ultrassom';
  if (t.includes('braquiterapia')) return 'Braquiterapia';
  if (t.includes('endoscopia')) return 'Endoscopia';
  if (t.includes('cintilograf') || t.includes('gama camara') || t.includes('gama probe')) return 'Medicina Nuclear';
  return 'Outro';
}

/** Gráfico de pizza em SVG puro (sem lib -- preferência de "opção mais
 * leve" já registrada em memória) -- poucas categorias (tipo de
 * contratação tem só 2-3), cabe bem em pizza. */
function GraficoPizza({ itens }: { itens: ContagemRotulo[] }) {
  const total = itens.reduce((s, i) => s + i.quantidade, 0);
  if (total === 0) return <p style={{ fontSize: 12, color: colors.mutedText, fontStyle: 'italic' }}>Sem dado ainda.</p>;

  const raio = 70, cx = 80, cy = 80;
  let anguloAcumulado = -Math.PI / 2; // comeca no topo (12h), sentido horario
  const fatias = itens.map((item, i) => {
    const fracao = item.quantidade / total;
    const anguloInicio = anguloAcumulado;
    const anguloFim = anguloAcumulado + fracao * 2 * Math.PI;
    anguloAcumulado = anguloFim;
    const x1 = cx + raio * Math.cos(anguloInicio), y1 = cy + raio * Math.sin(anguloInicio);
    const x2 = cx + raio * Math.cos(anguloFim), y2 = cy + raio * Math.sin(anguloFim);
    const grandeArco = anguloFim - anguloInicio > Math.PI ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${raio} ${raio} 0 ${grandeArco} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
    return { ...item, d, cor: PALETA[i % PALETA.length], pct: fracao };
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <svg width={160} height={160} viewBox="0 0 160 160" role="img" aria-label="Distribuição por tipo de contratação">
        {fatias.map((f) => <path key={f.rotulo} d={f.d} fill={f.cor} stroke="#fff" strokeWidth={1.5} />)}
      </svg>
      <div style={{ display: 'grid', gap: 6 }}>
        {fatias.map((f) => (
          <div key={f.rotulo} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: f.cor, flexShrink: 0 }} />
            <span>{f.rotulo}</span>
            <strong>{f.quantidade}</strong>
            <span style={{ color: colors.mutedText }}>({Math.round(f.pct * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Barras verticais em SVG puro -- mesma técnica leve do resto do painel,
 * troca as barras horizontais por um formato melhor pra comparar muitas
 * categorias lado a lado (achado 2026-09-10, pedido do usuário). */
function BarrasVerticais({ itens, corBarra }: { itens: ContagemRotulo[]; corBarra: string }) {
  if (itens.length === 0) return <p style={{ fontSize: 12, color: colors.mutedText, fontStyle: 'italic' }}>Sem dado ainda.</p>;
  const max = Math.max(1, ...itens.map((i) => i.quantidade));
  const alturaMax = 120;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: alturaMax + 40, overflowX: 'auto', paddingBottom: 4 }}>
      {itens.map((item) => {
        const altura = Math.max((item.quantidade / max) * alturaMax, 4);
        return (
          <div key={item.rotulo} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 36 }}>
            <span style={{ fontSize: 11, fontWeight: 700 }}>{item.quantidade}</span>
            <div style={{ width: 26, height: altura, background: corBarra, borderRadius: '4px 4px 0 0' }} />
            <span style={{ fontSize: 10.5, color: colors.mutedText, writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 46 }}>{item.rotulo}</span>
          </div>
        );
      })}
    </div>
  );
}

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
  // FAF/TED (chave = numero digitos-so) nunca batem aqui de proposito --
  // nao tem registro no SICONV/TransfereGov, contribuem 0 sem fabricar valor.
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

  if (erro) return <p style={{ color: colors.hipoRed }}>Erro ao carregar: {erro}</p>;
  if (!resumo || !instrumentos || !marcos) {
    return <p style={{ color: colors.mutedText }}>Carregando...</p>;
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

  // Distribuição por TIPO de equipamento -- achado 2026-09-10, bloco novo
  // (pedido do usuário: "os equipamentos achei bem pobre"), ver
  // extrairFamiliaEquipamento acima.
  const porFamiliaEquipamento = (() => {
    const c = new Map<string, number>();
    for (const i of instrumentos) {
      const familia = extrairFamiliaEquipamento(i.equipamento_descricao);
      c.set(familia, (c.get(familia) ?? 0) + 1);
    }
    return [...c.entries()].map(([rotulo, quantidade]) => ({ rotulo, quantidade })).sort((a, b) => b.quantidade - a.quantidade);
  })();

  return (
    <div>
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

      {/* Equipamentos em destaque -- achado 2026-09-10, bloco novo (pedido
          do usuário: "um ponto que precisa de mais destaque é os
          equipamentos"). Pizza pro tipo de contratação, barras verticais
          pro ranking de UF -- variedade visual pedida na mesma rodada. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div style={estiloCard}>
          <strong style={{ fontSize: 13 }}>Por tipo de equipamento</strong>
          <div style={{ marginTop: 12 }}>
            <BarraDistribuicao itens={porFamiliaEquipamento} corBarra={colors.primaryDark} />
          </div>
        </div>
        <div style={estiloCard}>
          <strong style={{ fontSize: 13 }}>Por tipo de contratação</strong>
          <div style={{ marginTop: 12 }}>
            <GraficoPizza itens={porTipoContratacao} />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div style={estiloCard}>
          <strong style={{ fontSize: 13 }}>Top 10 UF</strong>
          <div style={{ marginTop: 12 }}>
            <BarrasVerticais itens={porUf} corBarra={colors.hiperGreen} />
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
  );
}
