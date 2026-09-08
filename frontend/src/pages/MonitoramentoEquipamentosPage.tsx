/**
 * Pagina de MONITORAMENTO DE EQUIPAMENTO -- separada da analise de merito
 * de hipo/hipersuficiencia (decisao do usuario, 2026-09-03). Fora do
 * AppLayout/TopNav de proposito (ver App.tsx): sem link nenhum a partir do
 * resto do app, sem FamiliaEquipamentoContext -- so acessivel indo direto na
 * URL /monitoramento-equipamentos. Reusa a paleta/tokens/componentes do
 * resto do app (styles/tokens.ts, KpiCard, SearchInput, SingleSelectFilter)
 * pra manter a mesma linguagem visual da analise hiper/hipo (decisao
 * 2026-09-03) -- so nao entra no AppLayout mesmo (sem Header/TopNav).
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
import { useMemo, useState } from 'react';
import { KpiCard } from '../components/dashboard/KpiCard';
import { SearchInput } from '../components/common/SearchInput';
import { SingleSelectFilter } from '../components/common/SingleSelectFilter';
import { colors, layout } from '../styles/tokens';
import { normalizarTexto } from '../utils/texto';
import { ConvenioCard } from './monitoramento/ConvenioCard';
import { EQUIPAMENTOS_ALVO, equipamentosDoConvenio } from './monitoramento/equipamentoTags';
import { fmtMoeda } from './monitoramento/format';
import { mesclarConvenios } from './monitoramento/mesclarConvenios';
import { SecaoComponentes } from './monitoramento/SecaoComponentes';
import type { ComponenteOncologia, ConvenioPortal, SiconvEntrada, TransfereGovEnte } from './monitoramento/types';
import { LEGENDA_STATUS } from './monitoramento/ui';
import { useJson } from './monitoramento/useJson';

export function MonitoramentoEquipamentosPage() {
  const [busca, setBusca] = useState('');
  const [uf, setUf] = useState<string | null>(null);
  const [equipamento, setEquipamento] = useState<string | null>(null);

  const { dados: portal, erro: erroPortal } = useJson<ConvenioPortal[]>('/monitoramento-equipamentos/convenios.json');
  const { dados: siconv, erro: erroSiconv } = useJson<SiconvEntrada[]>('/monitoramento-equipamentos/siconv.json');
  const { dados: transferegov, erro: erroTransferegov } = useJson<TransfereGovEnte[]>('/monitoramento-equipamentos/transferegov.json');
  const { dados: componentes } = useJson<ComponenteOncologia[]>('/monitoramento-equipamentos/componentes_oncologia.json');

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

  const filtrados = useMemo(() => {
    if (!convenios) return [];
    return convenios.filter((c) => {
      if (uf && c.uf !== uf) return false;
      if (equipamento && !equipamentosPorNumero.get(c.numero)?.includes(equipamento)) return false;
      if (busca) {
        const alvo = normalizarTexto(`${c.numero} ${c.convenente.nome} ${c.convenente.cnpj} ${c.municipio} ${c.objeto}`);
        if (!alvo.includes(normalizarTexto(busca))) return false;
      }
      return true;
    });
  }, [convenios, busca, uf, equipamento, equipamentosPorNumero]);

  const totalGlobal = filtrados.reduce((a, c) => a + (c.financeiro.global || 0), 0);
  const totalDesembolsado = filtrados.reduce((a, c) => a + (c.financeiro.desembolsado || 0), 0);
  const totalEquipamentos = filtrados.reduce((a, c) => a + (equipamentosPorNumero.get(c.numero)?.length ?? 0), 0);

  const erro = erroPortal || erroSiconv || erroTransferegov;

  return (
    <div style={{ minHeight: '100vh', background: colors.surface, padding: layout.pagePadding }}>
      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, margin: '0 0 4px', color: '#16213e' }}>Monitoramento de Equipamentos — Convênios (MS)</h1>
        <p style={{ color: colors.mutedText, fontSize: 13, maxWidth: 900, lineHeight: 1.6, marginBottom: 20 }}>
          Página separada da análise de mérito de hipo/hipersuficiência do SIEO — {convenios?.length ?? '...'} convênios
          de aquisição de equipamento (71 validados manualmente + levantamento nacional por item de equipamento no
          SICONV, ver <code>backend/scripts/levantamento_convenios_oncologia.py</code>), com Portal da Transparência +
          SICONV legado + TransfereGov novo mesclados num registro só por convênio.
        </p>

        {erro && <p style={{ color: colors.hipoRed }}>Erro ao carregar dados: {erro}</p>}

        {!convenios ? (
          <p style={{ color: colors.mutedText }}>Carregando...</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: layout.cardGap, flexWrap: 'wrap', marginBottom: 14 }}>
              <KpiCard label="Convênios" value={filtrados.length} color={colors.primary} />
              <KpiCard label="Valor global total" value={fmtMoeda(totalGlobal)} color={colors.primary} />
              <KpiCard label="Valor desembolsado total" value={fmtMoeda(totalDesembolsado)} color={colors.hiperGreen} />
              <KpiCard label="Parque tecnológico (itens)" value={totalEquipamentos} color={colors.primary} />
            </div>

            {/* Legenda de cor -- situacao de convenio tem ~9 variacoes
                reais, o vocabulario visual so tem 4 familias (ver
                situacaoCor em ui.tsx). */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 16, fontSize: 11.5, color: colors.mutedText }}>
              {LEGENDA_STATUS.map((l) => (
                <span key={l.rotulo} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: l.cor, display: 'inline-block' }} />
                  {l.rotulo}
                </span>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <SearchInput value={busca} onChange={setBusca} placeholder="Buscar por convenente, município, número, CNPJ..." />
              <SingleSelectFilter placeholder="Todas as UFs" options={ufs} value={uf} onChange={setUf} clearLabel="Todas as UFs" minWidth={160} />
              <SingleSelectFilter placeholder="Todos os equipamentos" options={equipamentoOptions} value={equipamento} onChange={setEquipamento} clearLabel="Todos os equipamentos" minWidth={200} />
            </div>

            <div style={{ color: colors.mutedText, fontSize: 12, marginBottom: 10 }}>
              {filtrados.length} de {convenios.length} convênio(s)
            </div>

            {filtrados.map((c) => <ConvenioCard key={c.numero} c={c} />)}
          </>
        )}

        {componentes && <SecaoComponentes dados={componentes} />}
      </div>
    </div>
  );
}
