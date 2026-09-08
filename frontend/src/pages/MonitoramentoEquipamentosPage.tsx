/**
 * Pagina de MONITORAMENTO DE EQUIPAMENTO -- separada da analise de merito
 * de hipo/hipersuficiencia (decisao do usuario, 2026-09-03). Fora do
 * AppLayout/TopNav de proposito (ver App.tsx): sem link nenhum a partir do
 * resto do app, sem FamiliaEquipamentoContext -- so acessivel indo direto na
 * URL /monitoramento-equipamentos. Reusa a paleta/tokens/componentes do
 * resto do app (styles/tokens.ts, KpiCard, SearchInput, SingleSelectFilter)
 * pra manter a mesma linguagem visual da analise hiper/hipo (decisao
 * 2026-09-03) -- so nao entra no AppLayout mesmo (sem Header/TopNav,
 * decisao reafirmada 2026-09-08: layout redesenhado com estrutura de abas
 * inspirada num prototipo Stitch, mas sem sidebar de navegacao -- essa
 * pagina nao tem irmãs pra navegar entre si, so duplicaria a barra de
 * abas logo abaixo sem necessidade).
 *
 * Um registro por convenio, cruzando as 3 fontes oficiais (ver
 * monitoramento/mesclarConvenios.ts pra qual fonte vence em cada campo
 * duplicado):
 *   - Portal da Transparencia (/convenios/numero) -- 1:1 exato por numero,
 *     unica fonte com convenente/municipio/objeto legivel pros 71
 *   - SICONV legado (dump bulk) -- 1:1 exato por numero, valores
 *     financeiros corretos (Portal tem bug de truncamento confirmado) +
 *     granular (empenho/desembolso/licitacao/item de plano de aplicacao)
 *   - TransfereGov novo (modulo Gestao de Parcerias) -- cruzado por CNPJ do
 *     convenente, aproximacao (a API nova nao tem numero de convenio legado)
 *
 * O monitoramento interno pos-repasse (POC, fala com o backend em vez de
 * JSON estatico) fica DENTRO de cada card, numa secao separada das 3 fontes
 * estaticas (so busca quando o card e aberto) -- ver
 * monitoramento/ConvenioCard.tsx e monitoramento/MonitoramentoInterno.tsx.
 *
 * Os 3 JSON vem de backend/scripts/coletar_*.py e validar_convenios.py --
 * copiados pra public/monitoramento-equipamentos/ (ver README la) sempre
 * que os scripts rodarem de novo.
 */
import { useEffect, useMemo, useState } from 'react';
import { KpiCard } from '../components/dashboard/KpiCard';
import { Pagination } from '../components/common/Pagination';
import { SearchInput } from '../components/common/SearchInput';
import { SingleSelectFilter } from '../components/common/SingleSelectFilter';
import { colors, layout } from '../styles/tokens';
import { normalizarTexto } from '../utils/texto';
import { ConvenioCard } from './monitoramento/ConvenioCard';
import { EQUIPAMENTOS_ALVO, equipamentosDoConvenio } from './monitoramento/equipamentoTags';
import { fmtMoeda } from './monitoramento/format';
import { mesclarConvenios } from './monitoramento/mesclarConvenios';
import { SecaoComponentes } from './monitoramento/SecaoComponentes';
import type { ComponenteOncologia, ConvenioPortal, ProgramaTransfereGov, SiconvEntrada, TransfereGovEnte } from './monitoramento/types';
import { LEGENDA_STATUS } from './monitoramento/ui';
import { useInstrumentosMonitorados } from './monitoramento/useInstrumentosMonitorados';
import { useJson } from './monitoramento/useJson';

type Aba = 'convenios' | 'componentes';

/** So "Convenio" tem dado carregado hoje (e o universo inteiro do SICONV/
 * Portal da Transparencia que a pagina cruza). PERSUS I/II, FAF e TED sao
 * outros tipos de instrumento de repasse que a equipe ainda vai trazer --
 * o filtro ja aparece pra deixar o escopo futuro visivel, mas selecionar
 * um deles hoje mostra lista vazia (nunca dado inventado). */
const TIPOS_CONTRATACAO = [
  { value: 'convenio', label: 'Convênios' },
  { value: 'persus1', label: 'PERSUS I (ainda não incluído)' },
  { value: 'persus2', label: 'PERSUS II (ainda não incluído)' },
  { value: 'faf', label: 'FAF (ainda não incluído)' },
  { value: 'ted', label: 'TED (ainda não incluído)' },
];

// Card com 2 camadas (ConvenioCard.tsx) e mais pesado que linha de tabela --
// pagina de 20 em vez dos 50 que EstabelecimentoTable usa pra linha simples.
const PAGE_SIZE = 20;

export function MonitoramentoEquipamentosPage() {
  const [aba, setAba] = useState<Aba>('convenios');
  const [busca, setBusca] = useState('');
  const [uf, setUf] = useState<string | null>(null);
  const [equipamento, setEquipamento] = useState<string | null>(null);
  const [situacao, setSituacao] = useState<string | null>(null);
  const [ano, setAno] = useState<string | null>(null);
  const [tipoContratacao, setTipoContratacao] = useState<string | null>('convenio');
  const [soMonitorados, setSoMonitorados] = useState(false);
  const [pagina, setPagina] = useState(1);
  const monitorados = useInstrumentosMonitorados();

  const { dados: portal, erro: erroPortal } = useJson<ConvenioPortal[]>('/monitoramento-equipamentos/convenios.json');
  const { dados: siconv, erro: erroSiconv } = useJson<SiconvEntrada[]>('/monitoramento-equipamentos/siconv.json');
  const { dados: transferegov, erro: erroTransferegov } = useJson<TransfereGovEnte[]>('/monitoramento-equipamentos/transferegov.json');
  const { dados: componentes } = useJson<ComponenteOncologia[]>('/monitoramento-equipamentos/componentes_oncologia.json');
  const { dados: programasLista } = useJson<ProgramaTransfereGov[]>('/monitoramento-equipamentos/programas_transferegov.json');
  const programas = useMemo(() => new Map((programasLista ?? []).map((p) => [p.id_programa, p])), [programasLista]);

  // CNPJ (so digitos) -> componente(s) -- cruza componentes_oncologia.json
  // (API TransfereGov, ver types.ts::ComponenteOncologia) com o convenente
  // pelo mesmo CNPJ, mesma aproximacao ja usada na secao TransfereGov do
  // card (nao e o numero exato do convenio -- FAF SAUDE nao tem numero
  // legado). So API conta aqui, nunca a planilha interna (decisao do
  // usuario 2026-09-08).
  const componentesPorCnpj = useMemo(() => {
    const mapa = new Map<string, { componente: string; ano: number }[]>();
    for (const comp of componentes ?? []) {
      for (const p of comp.propostas) {
        if (!p.cnpj) continue;
        const digitos = p.cnpj.replace(/\D/g, '');
        const lista = mapa.get(digitos) ?? [];
        lista.push({ componente: comp.componente, ano: comp.ano_programa });
        mapa.set(digitos, lista);
      }
    }
    return mapa;
  }, [componentes]);

  const convenios = useMemo(() => {
    if (!portal || !siconv || !transferegov) return null;
    return mesclarConvenios(portal, siconv, transferegov);
  }, [portal, siconv, transferegov]);

  const ufs = useMemo(() => {
    if (!convenios) return [];
    return [...new Set(convenios.map((c) => c.uf))]
      .filter(Boolean)
      .sort()
      .map((u) => ({ value: u, label: u }));
  }, [convenios]);

  // Tag de equipamento por convenio -- reclassifica os itens SICONV/
  // TransfereGov que o convenio ja tem carregado, mesmos padroes do
  // levantamento nacional (ver equipamentoTags.ts). So p/ KPI + filtro.
  const equipamentosPorNumero = useMemo(() => {
    if (!convenios) return new Map<string, string[]>();
    return new Map(convenios.map((c) => [c.numero, equipamentosDoConvenio(c)]));
  }, [convenios]);

  const equipamentoOptions = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const tags of equipamentosPorNumero.values()) {
      for (const t of tags) contagem.set(t, (contagem.get(t) ?? 0) + 1);
    }
    return EQUIPAMENTOS_ALVO.map((e) => ({ value: e, label: `${e} (${contagem.get(e) ?? 0})` }));
  }, [equipamentosPorNumero]);

  const anoOptions = useMemo(() => {
    if (!convenios) return [];
    const anos = new Set<string>();
    for (const c of convenios) {
      const ano = c.datas.publicacao?.slice(0, 4);
      if (ano) anos.add(ano);
    }
    return [...anos].sort().reverse().map((a) => ({ value: a, label: a }));
  }, [convenios]);

  const situacaoOptions = useMemo(() => {
    if (!convenios) return [];
    const contagem = new Map<string, number>();
    for (const c of convenios) contagem.set(c.situacao, (contagem.get(c.situacao) ?? 0) + 1);
    return [...contagem.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => ({ value: s, label: `${s} (${n})` }));
  }, [convenios]);

  const filtrados = useMemo(() => {
    // "Convenio" e o unico tipo de contratacao com dado -- qualquer outro
    // valor (PERSUS I/II, FAF, TED) mostra lista vazia de proposito, nunca
    // dado inventado (ver TIPOS_CONTRATACAO acima).
    if (!convenios || (tipoContratacao && tipoContratacao !== 'convenio')) return [];
    const lista = convenios.filter((c) => {
      if (uf && c.uf !== uf) return false;
      if (equipamento && !equipamentosPorNumero.get(c.numero)?.includes(equipamento)) return false;
      if (situacao && c.situacao !== situacao) return false;
      if (ano && c.datas.publicacao?.slice(0, 4) !== ano) return false;
      if (soMonitorados && !monitorados.has(c.numero)) return false;
      if (busca) {
        const alvo = normalizarTexto(`${c.numero} ${c.convenente.nome} ${c.convenente.cnpj} ${c.municipio} ${c.objeto}`);
        if (!alvo.includes(normalizarTexto(busca))) return false;
      }
      return true;
    });
    // Convenio com monitoramento interno ativo primeiro -- e o unico dado
    // editavel da pagina toda, merece ficar visivel sem precisar escanear
    // ~300 cards pra achar (so 1 hoje, mas o desenho ja escala pra mais).
    return [...lista].sort((a, b) => Number(monitorados.has(b.numero)) - Number(monitorados.has(a.numero)));
  }, [convenios, busca, uf, equipamento, situacao, ano, tipoContratacao, soMonitorados, equipamentosPorNumero, monitorados]);

  // Volta pra pagina 1 sempre que filtro/busca mudar -- senao o usuario
  // pode ficar preso numa pagina que nao existe mais no resultado novo.
  useEffect(() => setPagina(1), [busca, uf, equipamento, situacao, ano, tipoContratacao, soMonitorados]);

  const paginados = filtrados.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE);

  const totalGlobal = filtrados.reduce((a, c) => a + (c.financeiro.global || 0), 0);
  const totalDesembolsado = filtrados.reduce((a, c) => a + (c.financeiro.desembolsado || 0), 0);
  const totalEquipamentos = filtrados.reduce((a, c) => a + (equipamentosPorNumero.get(c.numero)?.length ?? 0), 0);

  const erro = erroPortal || erroSiconv || erroTransferegov;
  const totalComponentes = componentes?.reduce((a, c) => a + c.total_propostas, 0) ?? 0;

  return (
    <div style={{ minHeight: '100vh', background: colors.surface, padding: layout.pagePadding }}>
      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto' }}>
        {/* Cabecalho -- breadcrumb institucional + titulo, puxado do
            prototipo de referencia (so a tipografia/hierarquia, dado real). */}
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: colors.subtleText, marginBottom: 6 }}>
          Ministério da Saúde <span style={{ margin: '0 4px' }}>›</span> DECAN / FNS <span style={{ margin: '0 4px' }}>›</span>{' '}
          <span style={{ color: colors.primary }}>Monitoramento de Instrumentos</span>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em', margin: '0 0 6px', color: colors.primary }}>
          Painel de Convênios &amp; Equipamentos Oncológicos
        </h1>
        <p style={{ color: colors.mutedText, fontSize: 13, maxWidth: 900, lineHeight: 1.6, marginBottom: 20 }}>
          Página separada da análise de mérito de hipo/hipersuficiência do SIEO — {convenios?.length ?? '...'} convênios
          de aquisição de equipamento (71 validados manualmente + levantamento nacional por item de equipamento no
          SICONV, ver <code>backend/scripts/levantamento_convenios_oncologia.py</code>), com Portal da Transparência +
          SICONV legado + TransfereGov novo mesclados num registro só por convênio.
        </p>

        {erro && <p style={{ color: colors.hipoRed }}>Erro ao carregar dados: {erro}</p>}

        {/* Abas -- Convenios (299 registros, dado ja mesclado) e
            Componentes de financiamento (agrupamento diferente do mesmo
            universo, ver SecaoComponentes.tsx). Antes ficava tudo numa
            rolagem so; virar aba de verdade reduz a pagina a um assunto
            por vez. */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `1px solid ${colors.border}` }}>
          <button
            onClick={() => setAba('convenios')}
            style={{
              padding: '10px 16px', fontSize: 13, fontWeight: 700, border: 'none', background: 'transparent', cursor: 'pointer',
              color: aba === 'convenios' ? colors.primary : colors.mutedText,
              borderBottom: aba === 'convenios' ? `2px solid ${colors.primary}` : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            Convênios <span style={{ color: colors.subtleText, fontWeight: 500 }}>({convenios?.length ?? 0})</span>
          </button>
          <button
            onClick={() => setAba('componentes')}
            style={{
              padding: '10px 16px', fontSize: 13, fontWeight: 700, border: 'none', background: 'transparent', cursor: 'pointer',
              color: aba === 'componentes' ? colors.primary : colors.mutedText,
              borderBottom: aba === 'componentes' ? `2px solid ${colors.primary}` : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            Componentes de financiamento <span style={{ color: colors.subtleText, fontWeight: 500 }}>({totalComponentes})</span>
          </button>
        </div>

        {aba === 'convenios' && (
          !convenios ? (
            <p style={{ color: colors.mutedText }}>Carregando...</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: layout.cardGap, flexWrap: 'wrap', marginBottom: 16 }}>
                <KpiCard label="Convênios" value={filtrados.length} color={colors.primary} />
                <KpiCard label="Valor global total" value={fmtMoeda(totalGlobal)} color={colors.primary} />
                <KpiCard label="Valor desembolsado total" value={fmtMoeda(totalDesembolsado)} color={colors.hiperGreen} />
                <KpiCard
                  label="Monitorados internamente"
                  value={monitorados.size}
                  color={colors.hiperGreen}
                  onClick={() => setSoMonitorados((v) => !v)}
                  ativo={soMonitorados}
                />
                <KpiCard label="Parque tecnológico (itens)" value={totalEquipamentos} color={colors.primary} />
              </div>

              {/* Legenda de cor -- situacao de convenio tem ~9 variacoes
                  reais, o vocabulario visual so tem 4 familias (ver
                  situacaoCor em ui.tsx). */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 18, fontSize: 11.5, color: colors.mutedText }}>
                {LEGENDA_STATUS.map((l) => (
                  <span key={l.rotulo} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: l.cor, display: 'inline-block' }} />
                    {l.rotulo}
                  </span>
                ))}
              </div>

              <div style={{
                background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 14,
                boxShadow: '0 1px 3px rgba(22,33,62,0.06)', marginBottom: 16,
                display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
              }}>
                <SearchInput value={busca} onChange={setBusca} placeholder="Buscar por convenente, município, número, CNPJ..." />
                <SingleSelectFilter placeholder="Tipo de contratação" options={TIPOS_CONTRATACAO} value={tipoContratacao} onChange={setTipoContratacao} clearLabel="Todos os tipos" minWidth={150} />
                <SingleSelectFilter placeholder="Todas as UFs" options={ufs} value={uf} onChange={setUf} clearLabel="Todas as UFs" minWidth={160} />
                <SingleSelectFilter placeholder="Todos os equipamentos" options={equipamentoOptions} value={equipamento} onChange={setEquipamento} clearLabel="Todos os equipamentos" minWidth={200} />
                <SingleSelectFilter placeholder="Todas as situações" options={situacaoOptions} value={situacao} onChange={setSituacao} clearLabel="Todas as situações" minWidth={200} />
                <SingleSelectFilter placeholder="Ano de publicação" options={anoOptions} value={ano} onChange={setAno} clearLabel="Todos os anos" minWidth={140} />
              </div>

              {tipoContratacao && tipoContratacao !== 'convenio' ? (
                <p style={{ color: colors.mutedText, fontSize: 13, fontStyle: 'italic', padding: '20px 0' }}>
                  {TIPOS_CONTRATACAO.find((t) => t.value === tipoContratacao)?.label} ainda não foi incluído nos dados do sistema —
                  hoje a página só cruza convênios (Portal da Transparência + SICONV + TransfereGov).
                </p>
              ) : (
                <>
                  <div style={{ color: colors.mutedText, fontSize: 12, marginBottom: 10 }}>
                    {filtrados.length} de {convenios.length} convênio(s)
                  </div>

                  {paginados.map((c) => (
                    <ConvenioCard
                      key={c.numero}
                      c={c}
                      monitorado={monitorados.has(c.numero)}
                      componentes={componentesPorCnpj.get(c.convenente.cnpj.replace(/\D/g, '')) ?? []}
                      equipamentos={equipamentosPorNumero.get(c.numero) ?? []}
                      programas={programas}
                    />
                  ))}

                  <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 10, marginTop: 4 }}>
                    <Pagination page={pagina} totalItems={filtrados.length} pageSize={PAGE_SIZE} onPageChange={setPagina} />
                  </div>
                </>
              )}
            </>
          )
        )}

        {aba === 'componentes' && (componentes ? <SecaoComponentes dados={componentes} /> : <p style={{ color: colors.mutedText }}>Carregando...</p>)}
      </div>
    </div>
  );
}
