/**
 * Painel de Gestão -- pedido do usuário 2026-09-09, 2a rodada: "crie uma
 * página de painel apenas com dashboards, seja criativo e rico em
 * detalhes, será para avaliação da gestão". Rota
 * `/monitoramento-equipamentos/painel`, dentro de `MonitoramentoLayout`
 * (achado 2026-09-10 -- nav propria, ver AppHeader.tsx).
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
import { KpiCard } from '@/components/common/kpi-card';
import { cn } from '@/lib/utils';
import { normalizarTexto } from '@/utils/texto';
import { fetchInstrumentos, fetchMarcos, fetchResumoMonitoramento } from '@/services/monitoramento';
import { BarraDistribuicao, classeValidade, estiloCard, type ContagemRotulo } from '@/components/features/monitoramento-ui';
import { fmtData, fmtMoeda } from '@/lib/monitoramento-format';
import { useJson } from '@/hooks/useJson';
import type { SiconvEntrada } from '@/types/monitoramento';

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
// os tokens do projeto na ordem (via variavel CSS, pro SVG que precisa de
// cor solida em atributo, nao className), repete se tiver mais categorias
// que cor.
const PALETA = ['var(--primary)', 'var(--success)', 'var(--warning)', 'var(--foreground)', 'var(--destructive)', '#8e6fce', '#2aa8b0', '#c9538a'];

/** Mesmos limiares de classeValidade (monitoramento-ui.tsx), mas como
 * classe Tailwind de `bg-*` pro dot de status (o texto usa `classeValidade`
 * direto, que ja devolve `text-*`). */
function bgValidade(dias: number): string {
  if (dias < 180) return dias < 90 ? 'bg-destructive' : 'bg-warning';
  return 'bg-success';
}

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
  if (total === 0) return <p className="text-xs text-muted-foreground italic">Sem dado ainda.</p>;

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
    <div className="flex items-center gap-5 flex-wrap">
      <svg width={160} height={160} viewBox="0 0 160 160" role="img" aria-label="Distribuição por tipo de contratação">
        {fatias.map((f) => <path key={f.rotulo} d={f.d} fill={f.cor} stroke="var(--card)" strokeWidth={1.5} />)}
      </svg>
      <div className="grid gap-1.5">
        {fatias.map((f) => (
          <div key={f.rotulo} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: f.cor }} />
            <span>{f.rotulo}</span>
            <strong>{f.quantidade}</strong>
            <span className="text-muted-foreground">({Math.round(f.pct * 100)}%)</span>
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
  if (itens.length === 0) return <p className="text-xs text-muted-foreground italic">Sem dado ainda.</p>;
  const max = Math.max(1, ...itens.map((i) => i.quantidade));
  const alturaMax = 120;
  return (
    <div className="flex items-end gap-2.5 overflow-x-auto pb-1" style={{ height: alturaMax + 40 }}>
      {itens.map((item) => {
        const altura = Math.max((item.quantidade / max) * alturaMax, 4);
        return (
          <div key={item.rotulo} className="flex flex-col items-center gap-1 min-w-9">
            <span className="text-[11px] font-bold">{item.quantidade}</span>
            <div className="w-[26px] rounded-t" style={{ height: altura, background: corBarra }} />
            <span className="text-[10.5px] text-muted-foreground h-[46px] [writing-mode:vertical-rl] rotate-180">{item.rotulo}</span>
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
    <div className="grid gap-1.5">
      {fasesOrdenadas.map((f, i) => {
        const pct = f.quantidade / total;
        return (
          <div key={f.rotulo} className="flex items-center gap-2.5">
            <div className="w-[150px] text-[11.5px] text-muted-foreground text-right shrink-0">{f.rotulo}</div>
            <div className="flex-1 bg-background rounded-md overflow-hidden">
              <div
                className={cn(
                  'min-h-[22px] flex items-center justify-end px-2 rounded-br-md',
                  i === 0 ? 'rounded-tr-md' : 'rounded-tr-none',
                )}
                style={{
                  width: `${Math.max(pct * 100, f.quantidade > 0 ? 4 : 0)}%`,
                  background: 'linear-gradient(90deg, var(--primary), var(--foreground))',
                }}
              >
                {f.quantidade > 0 && <span className="text-primary-foreground text-[11px] font-bold">{f.quantidade}</span>}
              </div>
            </div>
            <div className="w-10 text-[11px] text-muted-foreground">{Math.round(pct * 100)}%</div>
          </div>
        );
      })}
    </div>
  );
}

/** Mesma linha do tempo por ano/mês do Overview -- versão compacta (sem
 * hover, só visual) pra caber num painel com mais blocos por tela. */
function MiniLinhaDoTempo({ itens }: { itens: InauguracaoApi[] }) {
  if (itens.length === 0) return <p className="text-xs text-muted-foreground italic">Nenhuma inauguração registrada ainda.</p>;
  const porAnoMes = new Map<string, InauguracaoApi[]>();
  for (const i of itens) {
    const d = new Date(i.data + 'T00:00:00');
    const chave = `${d.getFullYear()}-${d.getMonth()}`;
    if (!porAnoMes.has(chave)) porAnoMes.set(chave, []);
    porAnoMes.get(chave)!.push(i);
  }
  const anos = [...new Set(itens.map((i) => new Date(i.data + 'T00:00:00').getFullYear()))].sort();
  return (
    <div className="grid gap-2.5">
      {anos.map((ano) => {
        const totalAno = MESES_ABREV.reduce((s, _m, idx) => s + (porAnoMes.get(`${ano}-${idx}`)?.length ?? 0), 0);
        return (
          <div key={ano}>
            <div className="flex justify-between text-[11.5px] font-bold text-primary mb-1">
              <span>{ano}</span><span>{totalAno} equipamento(s)</span>
            </div>
            <div className="grid grid-cols-12 gap-[3px]">
              {MESES_ABREV.map((mes, idx) => {
                const doMes = porAnoMes.get(`${ano}-${idx}`) ?? [];
                const temRealizada = doMes.some((i) => i.realizada);
                return (
                  <div
                    key={mes}
                    title={doMes.map((i) => `${i.nome_convenente} (${fmtData(i.data)})`).join('\n') || undefined}
                    className={cn(
                      'h-[26px] rounded flex items-center justify-center text-[8.5px] font-bold',
                      temRealizada
                        ? 'bg-success text-success-foreground border-none'
                        : doMes.length
                          ? 'bg-card text-primary border-[1.5px] border-dashed border-primary'
                          : 'bg-background text-muted-foreground border border-border',
                    )}
                  >
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
    // Rotas exigem sessão desde o Plan Mode segurança 2026-09-16 (Bloco 1)
    // -- usa a camada de services (cookie via credentials:'include',
    // schema validado com Zod), não mais `fetch` cru direto na API.
    Promise.all([fetchResumoMonitoramento(), fetchInstrumentos(), fetchMarcos()])
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

  if (erro) return <p className="text-destructive">Erro ao carregar: {erro}</p>;
  if (!resumo || !instrumentos || !marcos) {
    return <p className="text-muted-foreground">Carregando...</p>;
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
      <div className="flex justify-between items-start flex-wrap gap-3">
        <h1 className="text-[26px] font-extrabold tracking-[-0.01em] m-0 mb-1.5 text-primary">
          Painel de Gestão — Equipamentos Oncológicos
        </h1>
        <Link
          to="/monitoramento-equipamentos/instrumentos"
          className="text-[12.5px] font-semibold text-primary no-underline whitespace-nowrap"
        >
          ← Ver operacional (por instrumento)
        </Link>
      </div>
      <p className="text-muted-foreground text-sm max-w-[900px] leading-relaxed mb-5">
        Visão executiva do acompanhamento pós-repasse de {resumo.total_instrumentos} instrumento(s) — pra avaliação
        da gestão, sem detalhe operacional por convênio (isso fica na{' '}
        <Link to="/monitoramento-equipamentos/instrumentos" className="text-primary">visão geral</Link>).
      </p>

      {/* KPIs executivos */}
      <div className="flex gap-4 flex-wrap mb-5">
        <KpiCard label="Instrumentos monitorados" value={resumo.total_instrumentos} variant="primary" />
        <KpiCard
          label="Execução física média"
          value={resumo.pct_execucao_fisica_medio != null ? `${Math.round(resumo.pct_execucao_fisica_medio * 100)}%` : '—'}
          variant="primary"
        />
        <KpiCard label="Valor global investido" value={financeiro ? fmtMoeda(financeiro.global) : '...'} variant="primary" />
        <KpiCard
          label="Pago ao fornecedor"
          value={financeiro ? `${fmtMoeda(financeiro.pago)}${financeiro.pct != null ? ` (${Math.round(financeiro.pct * 100)}%)` : ''}` : '...'}
          variant="success"
        />
        <KpiCard
          label="Licenças CNEN deferidas"
          value={`${resumo.licencas_cnen_deferidas}/${resumo.total_instrumentos}`}
          variant="success"
        />
      </div>

      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(420px,1fr))] gap-4 mb-5">
        <div className={estiloCard}>
          <strong className="text-sm">Funil de fases</strong>
          <div className="mt-3.5">
            <FunilFases fasesOrdenadas={funil} />
          </div>
        </div>
        <div className={estiloCard}>
          <strong className="text-sm">Inaugurações por ano</strong>
          <div className="mt-3">
            <MiniLinhaDoTempo itens={resumo.inauguracoes} />
          </div>
        </div>
      </div>

      {/* Equipamentos em destaque -- achado 2026-09-10, bloco novo (pedido
          do usuário: "um ponto que precisa de mais destaque é os
          equipamentos"). Pizza pro tipo de contratação, barras verticais
          pro ranking de UF -- variedade visual pedida na mesma rodada. */}
      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))] gap-4 mb-5">
        <div className={estiloCard}>
          <strong className="text-sm">Por tipo de equipamento</strong>
          <div className="mt-3">
            <BarraDistribuicao itens={porFamiliaEquipamento} corBarra="var(--foreground)" />
          </div>
        </div>
        <div className={estiloCard}>
          <strong className="text-sm">Por tipo de contratação</strong>
          <div className="mt-3">
            <GraficoPizza itens={porTipoContratacao} />
          </div>
        </div>
      </div>

      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))] gap-4 mb-5">
        <div className={estiloCard}>
          <strong className="text-sm">Top 10 UF</strong>
          <div className="mt-3">
            <BarrasVerticais itens={porUf} corBarra="var(--success)" />
          </div>
        </div>
        <div className={estiloCard}>
          <strong className="text-sm">Por componente</strong>
          <div className="mt-2.5">
            <BarraDistribuicao itens={porComponente} corBarra="var(--warning)" />
          </div>
        </div>
      </div>

      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))] gap-4 mb-5">
        <div className={estiloCard}>
          <strong className="text-sm">Licenças CNEN por vencer</strong>
          <div className="mt-2.5 grid gap-1.5 max-h-[300px] overflow-y-auto">
            {resumo.licencas_vencendo.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhuma licença com validade registrada ainda.</p>
            ) : resumo.licencas_vencendo.map((l) => (
              <Link
                key={l.nr_convenio}
                to={`/monitoramento-equipamentos/instrumentos/${l.nr_convenio}`}
                className="flex justify-between gap-2 text-xs no-underline text-inherit"
              >
                <span><span className={cn('w-2 h-2 rounded-full inline-block mr-1.5', bgValidade(l.dias))} />{l.nome_convenente} ({l.nr_convenio})</span>
                <strong className={cn('whitespace-nowrap', classeValidade(l.dias))}>
                  {l.dias < 0 ? `vencida há ${Math.abs(l.dias)}d` : `${l.dias}d`}
                </strong>
              </Link>
            ))}
          </div>
        </div>
        <div className={estiloCard}>
          <strong className="text-sm">Convênios por técnico titular</strong>
          <div className="mt-2.5">
            <BarraDistribuicao itens={resumo.por_tecnico_titular} corBarra="var(--foreground)" />
          </div>
        </div>
      </div>
    </div>
  );
}
