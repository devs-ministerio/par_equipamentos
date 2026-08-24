import { useEffect, useMemo, useState } from 'react';
import type { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { MacroMap } from '../components/mapa/MacroMap';
import {
  fetchEquipmentTotals,
  fetchHealthRegionCoverage,
  fetchLegalNatureBreakdown,
  fetchMacroCoverage,
  fetchMunicipalityCoverage,
} from '../services/api';
import type { NaturezaJuridicaBreakdown } from '../services/api';
import { CHAVE_STORAGE_FAMILIA } from '../context/FamiliaEquipamentoContext';
import { EQUIPAMENTOS, GEOJSON_MACRORREGIOES_URL, REGIOES, getEquipamento } from '../data/constants';
import { colors, layout } from '../styles/tokens';
import type { CoberturaRow, Macrorregiao, Regiao } from '../types/domain';

/** Rotulo/cor por natureza juridica -- "Privado" nao e cor de alerta (nao e
 * necessariamente ruim, so um risco a acompanhar: capacidade SUS via
 * contrato, nao infraestrutura propria), por isso laranja e nao vermelho. */
const NATUREZA_LABEL: Record<string, string> = {
  PUBLICO: 'Público',
  'SEM FINS LUCRATIVOS': 'Sem fins lucrativos',
  PRIVADO: 'Privado',
  NAO_INFORMADO: 'Não informado',
};
const NATUREZA_COR: Record<string, string> = {
  PUBLICO: colors.primary,
  'SEM FINS LUCRATIVOS': colors.hiperGreen,
  PRIVADO: colors.logoOrange,
  NAO_INFORMADO: colors.subtleText,
};
const NATUREZA_ORDEM = ['PUBLICO', 'SEM FINS LUCRATIVOS', 'PRIVADO', 'NAO_INFORMADO'];

// Corte de 100 mil habitantes usado pro card "Municípios Hipossuficientes" --
// mesmo criterio (e mesma ressalva: especifico do parametro do TOMOGRAFO, ver
// NivelCoberturaTable.tsx) do card equivalente no Dashboard, replicado aqui
// pro resumo nacional bater com o numero que o usuario ve ao entrar na
// familia.
const POPULACAO_MINIMA_HIPO = 100_000;

interface MacroRankItem {
  macroId: string;
  nome: string;
  uf: string;
  cobertura: number;
}

interface RegiaoBreakdown {
  regiao: Regiao;
  hipo: number;
  total: number;
}

interface ResumoFamilia {
  familia: string;
  totalSus: number;
  totalGeral: number;
  macros: Macrorregiao[];
  coberturaRows: CoberturaRow[];
  macrosHipo: number;
  macrosTotal: number;
  municipiosHipo: number;
  /** Municipios com >=100 mil hab. (o universo elegivel pro corte de Hipo,
   * ver POPULACAO_MINIMA_HIPO) -- so pra calcular a PROPORCAO de gravidade
   * do card de Cobertura, o numero mostrado continua sendo so municipiosHipo
   * (contagem absoluta, decisao original mantida). */
  municipiosTotal: number;
  regioesHipo: number;
  regioesTotal: number;
  /** 5 macros com a pior e com a melhor cobertura -- "onde focar primeiro"
   * (hipo) e "onde tem folga de sobra" (hiper), nao so "quantas tem
   * problema". Sem filtrar por status: hiper e literalmente as 5 de maior
   * cobertura, mesmo que status ja fosse Hiperssuficiente de sobra. */
  top5Hipo: MacroRankItem[];
  top5Hiper: MacroRankItem[];
  /** Contagem de macros Hipo/total por Grande Regiao (Norte/Nordeste/...) --
   * a contagem nacional sozinha esconde desigualdade regional. */
  porRegiao: RegiaoBreakdown[];
  naturezaJuridica: NaturezaJuridicaBreakdown[];
}

type EstadoResumo = ResumoFamilia | 'carregando' | 'erro';

async function buscarResumoFamilia(familia: string): Promise<ResumoFamilia> {
  const [coverage, totais, municipios, regioes, natureza] = await Promise.all([
    fetchMacroCoverage(familia),
    fetchEquipmentTotals({ equipmentFamily: familia }),
    fetchMunicipalityCoverage({ equipmentFamily: familia, minPopulation: POPULACAO_MINIMA_HIPO }),
    fetchHealthRegionCoverage({ equipmentFamily: familia }),
    fetchLegalNatureBreakdown(familia),
  ]);

  const macroById = new Map(coverage.macros.map((m) => [m.id, m]));

  const comMacro = coverage.coberturaRows
    .map((r) => ({ row: r, macro: macroById.get(r.macroId) }))
    .filter((x): x is { row: CoberturaRow; macro: Macrorregiao } => Boolean(x.macro));
  const paraItem = ({ row, macro }: { row: CoberturaRow; macro: Macrorregiao }): MacroRankItem => ({
    macroId: row.macroId,
    nome: macro.nome,
    uf: macro.uf,
    cobertura: row.cobertura,
  });
  const top5Hipo = comMacro
    .filter((x) => x.row.status === 'Hipossuficiente')
    .sort((a, b) => a.row.cobertura - b.row.cobertura)
    .slice(0, 5)
    .map(paraItem);
  const top5Hiper = comMacro
    .slice()
    .sort((a, b) => b.row.cobertura - a.row.cobertura)
    .slice(0, 5)
    .map(paraItem);

  const porRegiaoMap = new Map<Regiao, { hipo: number; total: number }>();
  coverage.coberturaRows.forEach((r) => {
    const macro = macroById.get(r.macroId);
    if (!macro) return;
    const atual = porRegiaoMap.get(macro.regiao) ?? { hipo: 0, total: 0 };
    atual.total += 1;
    if (r.status === 'Hipossuficiente') atual.hipo += 1;
    porRegiaoMap.set(macro.regiao, atual);
  });
  const porRegiao: RegiaoBreakdown[] = REGIOES.map((regiao) => ({
    regiao,
    ...(porRegiaoMap.get(regiao) ?? { hipo: 0, total: 0 }),
  }));

  return {
    familia,
    totalSus: totais.availableQty,
    totalGeral: totais.existingQty,
    macros: coverage.macros,
    coberturaRows: coverage.coberturaRows,
    macrosHipo: coverage.coberturaRows.filter((r) => r.status === 'Hipossuficiente').length,
    macrosTotal: coverage.coberturaRows.length,
    municipiosHipo: municipios.filter((r) => r.status === 'Hipossuficiente').length,
    municipiosTotal: municipios.length,
    regioesHipo: regioes.filter((r) => r.status === 'Hipossuficiente').length,
    regioesTotal: regioes.length,
    top5Hipo,
    top5Hiper,
    porRegiao,
    naturezaJuridica: natureza,
  };
}

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

function Secao({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 36 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#16213e' }}>{titulo}</div>
      {subtitulo && <div style={{ fontSize: 13, color: colors.mutedText, marginTop: 4, maxWidth: 720 }}>{subtitulo}</div>}
      <div style={{ marginTop: 16 }}>{children}</div>
    </div>
  );
}

/** Painel encaixado dentro do card da familia (2026-08-22) -- fundo
 * ligeiramente diferente do card branco que o contem, pra criar separacao
 * visual real ("card dentro do card") em vez de tudo ser texto pequeno
 * empilhado sem hierarquia. `flex: '0 0 auto'` (nao '1 1 auto') e proposital
 * -- CardFamilia e uma coluna flex, e os dois cards de familia lado a lado
 * tem a MESMA altura (grid `align-items: stretch`, ver PainelGeralPage);
 * sem isso, cada SubCard crescia pra preencher a sobra vertical quando um
 * card ficava mais alto que o outro, sobrando espaco vazio dentro da caixa
 * em vez de deixar o conteudo ditar a altura (bug real, 2026-08-22). */
function SubCard({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        padding: '16px 18px',
        flex: '0 0 auto',
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: colors.subtleText,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 13,
        }}
      >
        {titulo}
      </div>
      {children}
    </div>
  );
}

/** Cada estatistica de cobertura e o SEU PROPRIO card (2026-08-22, pedido
 * explicito) -- alinhados entre si (mesma altura/padding, `flex: 1` divide o
 * espaco igual) e, como as duas familias usam a mesma estrutura, tambem
 * alinhados verticalmente entre os cards de Tomografo e Ressonancia na
 * mesma linha do grid. Numero em preto/neutro de proposito (nao mais
 * vermelho/laranja/verde por gravidade, decisao 2026-08-22) -- esses 3 sao
 * "quantos", nao "quao grave"; quem carrega o sinal de gravidade agora e o
 * Ranking (barra por severidade) e o Mapa (gradiente), pra nao competir/
 * repetir o mesmo alerta em 3 lugares diferentes da mesma tela. */
function StatCard({ valor, label }: { valor: string; label: string }) {
  return (
    <div
      style={{
        flex: 1,
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        padding: '16px 12px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color: colors.primaryDark, letterSpacing: '-0.01em' }}>{valor}</div>
      <div style={{ fontSize: 10.5, color: colors.subtleText, marginTop: 5, lineHeight: 1.35 }}>{label}</div>
    </div>
  );
}

/** Barra empilhada Público/Sem fins lucrativos/Privado/Não informado, por
 * quantidade SUS (availableQty) -- "quanto da capacidade SUS depende de
 * contrato com privado" e um risco que hoje nao aparecia em lugar nenhum. */
function BarraNaturezaJuridica({ dados }: { dados: NaturezaJuridicaBreakdown[] }) {
  const total = dados.reduce((s, d) => s + d.availableQty, 0);
  if (total === 0) return <div style={{ fontSize: 12, color: colors.subtleText }}>Sem dado SUS nessa competência.</div>;

  const ordenados = [...dados]
    .filter((d) => d.availableQty > 0)
    .sort((a, b) => NATUREZA_ORDEM.indexOf(a.naturezaJuridica) - NATUREZA_ORDEM.indexOf(b.naturezaJuridica));

  return (
    <div>
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'clip' }}>
        {ordenados.map((d) => (
          <div
            key={d.naturezaJuridica}
            title={`${NATUREZA_LABEL[d.naturezaJuridica] ?? d.naturezaJuridica}: ${d.availableQty}`}
            style={{
              width: `${(d.availableQty / total) * 100}%`,
              background: NATUREZA_COR[d.naturezaJuridica] ?? colors.subtleText,
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 8 }}>
        {ordenados.map((d) => (
          <div key={d.naturezaJuridica} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: NATUREZA_COR[d.naturezaJuridica] ?? colors.subtleText,
                display: 'inline-block',
              }}
            />
            <span style={{ color: '#475066' }}>
              {NATUREZA_LABEL[d.naturezaJuridica] ?? d.naturezaJuridica} · {Math.round((d.availableQty / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Ranking (leaderboard) das 5 macros mais Hipo ou mais Hiper, com toggle
 * entre as duas visoes (2026-08-22). A barra NAO usa uma escala fixa
 * compartilhada entre os dois modos -- hipo vai de 0 a 100% (por definicao,
 * abaixo da meta), hiper passa de 500% em alguns casos (ex.: Centro-Norte/GO
 * a 570%). Numa escala unica os dois extremos ficariam ilegiveis (hipo
 * viraria barrinhas minusculas). Em vez disso cada visao escala em relacao
 * ao PROPRIO maior valor exibido (o #1 sempre enche a linha inteira) --
 * padrao comum de leaderboard, mostra ranking relativo, nao magnitude
 * absoluta entre os dois modos.
 *
 * Bug real corrigido 2026-08-22: no modo Hipo a barra usava a cobertura em
 * si (`item.cobertura / maior`) -- como o pior caso (#1) e o de MENOR
 * cobertura, ele tinha a barra mais CURTA da lista (ex.: OESTE-AM #1 a 17%
 * com barra minuscula, NORDESTE #5 a 89% quase cheia), o oposto do que
 * "barra mais longa" deveria comunicar num ranking de piores casos. Agora o
 * modo Hipo escala pela GRAVIDADE (100 - cobertura, "quao longe da meta"),
 * entao o #1 sempre fica com a barra mais cheia, do jeito que o olho espera.
 * O modo Hiper nao tinha esse problema (maior cobertura = mais barra = mais
 * folga, direcao ja intuitiva) e continua igual.
 */
function RankingMacros({ hipo, hiper }: { hipo: MacroRankItem[]; hiper: MacroRankItem[] }) {
  const [modo, setModo] = useState<'hipo' | 'hiper'>('hipo');
  const itens = modo === 'hipo' ? hipo : hiper;
  const cor = modo === 'hipo' ? colors.hipoRed : colors.hiperGreen;
  const valorBarra = (item: MacroRankItem) => (modo === 'hipo' ? Math.max(0, 100 - item.cobertura) : item.cobertura);
  // Hipo usa escala ABSOLUTA (0-100, o proprio valor de severidade vira a
  // largura direto) -- diferente do Hiper, que so faz sentido relativo ao
  // maior dos 5 exibidos (bug real corrigido 2026-08-22: OESTE a 17% tinha
  // severidade 83%, mas a barra aparecia 100% cheia porque escalava em
  // relacao a si mesmo, sendo o #1; 83% de severidade agora rende
  // literalmente 83% de barra). Hiper continua relativo porque nao tem teto
  // natural (chega a 570%) -- uma escala absoluta ali faria a maioria das
  // barras saturar no maximo e perder a diferenca entre os 5.
  const maiorValor = modo === 'hipo' ? 100 : Math.max(...itens.map(valorBarra), 1);

  if (hipo.length === 0 && hiper.length === 0) return null;

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button
          onClick={() => setModo('hipo')}
          disabled={hipo.length === 0}
          style={{
            padding: '4px 11px',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 700,
            cursor: hipo.length === 0 ? 'default' : 'pointer',
            border: `1.5px solid ${modo === 'hipo' ? colors.hipoRed : colors.border}`,
            background: modo === 'hipo' ? colors.hipoRedBg : '#fff',
            color: hipo.length === 0 ? colors.subtleText : modo === 'hipo' ? colors.hipoRed : '#475066',
            opacity: hipo.length === 0 ? 0.5 : 1,
          }}
        >
          ▾ 5 mais Hipo
        </button>
        <button
          onClick={() => setModo('hiper')}
          disabled={hiper.length === 0}
          style={{
            padding: '4px 11px',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 700,
            cursor: hiper.length === 0 ? 'default' : 'pointer',
            border: `1.5px solid ${modo === 'hiper' ? colors.hiperGreen : colors.border}`,
            background: modo === 'hiper' ? colors.hiperGreenBg : '#fff',
            color: hiper.length === 0 ? colors.subtleText : modo === 'hiper' ? colors.hiperGreen : '#475066',
            opacity: hiper.length === 0 ? 0.5 : 1,
          }}
        >
          ▴ 5 mais Hiper
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {itens.map((item, i) => (
          <div key={item.macroId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: '#f4f6fb',
                color: colors.subtleText,
                fontSize: 9.5,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {i + 1}
            </span>
            <span
              style={{
                fontSize: 11.5,
                color: '#475066',
                width: 178,
                flexShrink: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={`${item.nome} (${item.uf})`}
            >
              {item.nome} ({item.uf})
            </span>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#eef0f4', overflow: 'clip' }}>
              <div style={{ height: '100%', width: `${(valorBarra(item) / maiorValor) * 100}%`, background: cor }} />
            </div>
            <span
              style={{ width: 36, textAlign: 'right', fontSize: 11.5, fontWeight: 700, color: cor, flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              {item.cobertura.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CardFamilia({ resumo, rotulo, onEntrar }: { resumo: EstadoResumo; rotulo: string; onEntrar: () => void }) {
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
            <StatCard valor={`${resumo.macrosHipo} de ${resumo.macrosTotal}`} label="Macrorregiões hipossuficientes" />
            <StatCard
              valor={`${resumo.regioesHipo} de ${resumo.regioesTotal}`}
              label="Regiões de saúde hipossuficientes"
            />
            <StatCard valor={String(resumo.municipiosHipo)} label="Municípios hipossuficientes (≥100 mil hab.)" />
          </div>

          <SubCard titulo="Hipossuficientes por região">
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
          </SubCard>

          <SubCard titulo="Ranking de macrorregiões">
            <RankingMacros hipo={resumo.top5Hipo} hiper={resumo.top5Hiper} />
          </SubCard>

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
              <BarraNaturezaJuridica dados={resumo.naturezaJuridica} />
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
 * sem tentar buscar dado que nao existe ainda.
 */
export function PainelGeralPage() {
  const navigate = useNavigate();
  const familiasDisponiveis = useMemo(() => EQUIPAMENTOS.filter((eq) => eq.disponivel), []);

  const [resumos, setResumos] = useState<Record<string, EstadoResumo>>({});
  const [geo, setGeo] = useState<FeatureCollection<Geometry, GeoJsonProperties> | null>(null);
  const [familiaMapa, setFamiliaMapa] = useState(familiasDisponiveis[0]?.familia ?? 'TOMOGRAFO');

  useEffect(() => {
    let cancelado = false;
    familiasDisponiveis.forEach((eq) => {
      setResumos((prev) => ({ ...prev, [eq.familia]: 'carregando' }));
      buscarResumoFamilia(eq.familia)
        .then((resumo) => !cancelado && setResumos((prev) => ({ ...prev, [eq.familia]: resumo })))
        .catch(() => !cancelado && setResumos((prev) => ({ ...prev, [eq.familia]: 'erro' })));
    });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelado = false;
    fetch(GEOJSON_MACRORREGIOES_URL)
      .then((r) => r.json())
      .then((geoData) => !cancelado && setGeo(geoData))
      .catch(() => !cancelado && setGeo(null));
    return () => {
      cancelado = true;
    };
  }, []);

  const resumoMapa = resumos[familiaMapa];
  const macrosMapa = typeof resumoMapa === 'object' ? resumoMapa.macros : [];
  const coberturaRowsMapa = typeof resumoMapa === 'object' ? resumoMapa.coberturaRows : [];

  return (
    <div style={{ minHeight: '100vh', background: colors.surface, color: colors.primaryDark, fontSize: 14 }}>
      <Header />
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
          <div style={{ fontSize: 26, fontWeight: 800 }}>SIEO — Sistema de Equipamentos Oncológicos</div>
        </div>

        {/* Resumo por familia */}
        <Secao titulo="Cobertura por Equipamento">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: 20 }}>
            {familiasDisponiveis.map((eq) => (
              <CardFamilia
                key={eq.familia}
                rotulo={eq.rotulo}
                resumo={resumos[eq.familia] ?? 'carregando'}
                onEntrar={() => irParaEquipamentos(navigate, eq.familia, 'dashboard')}
              />
            ))}
          </div>
        </Secao>

        {/* Mapa nacional */}
        <Secao titulo="Mapa nacional" subtitulo="Cobertura por macrorregião de saúde, coloreada por Hipo/Hiperssuficiência.">
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
              {geo && macrosMapa.length > 0 ? (
                <MacroMap
                  geo={geo}
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
        </Secao>

        {/* Metodologia (teaser) */}
        <Secao titulo="Como a suficiência é calculada">
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
        </Secao>

        <div style={{ height: 40 }} />
      </div>
    </div>
  );
}
