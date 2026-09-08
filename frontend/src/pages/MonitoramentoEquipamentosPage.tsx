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
import { fmtMoeda } from './monitoramento/format';
import { mesclarConvenios } from './monitoramento/mesclarConvenios';
import type { ConvenioPortal, SiconvEntrada, TransfereGovEnte } from './monitoramento/types';
import { useJson } from './monitoramento/useJson';

export function MonitoramentoEquipamentosPage() {
  const [busca, setBusca] = useState('');
  const [uf, setUf] = useState<string | null>(null);

  const { dados: portal, erro: erroPortal } = useJson<ConvenioPortal[]>('/monitoramento-equipamentos/convenios.json');
  const { dados: siconv, erro: erroSiconv } = useJson<SiconvEntrada[]>('/monitoramento-equipamentos/siconv.json');
  const { dados: transferegov, erro: erroTransferegov } = useJson<TransfereGovEnte[]>('/monitoramento-equipamentos/transferegov.json');

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

  const filtrados = useMemo(() => {
    if (!convenios) return [];
    return convenios.filter((c) => {
      if (uf && c.uf !== uf) return false;
      if (busca) {
        const alvo = normalizarTexto(`${c.numero} ${c.convenente.nome} ${c.convenente.cnpj} ${c.municipio} ${c.objeto}`);
        if (!alvo.includes(normalizarTexto(busca))) return false;
      }
      return true;
    });
  }, [convenios, busca, uf]);

  const totalGlobal = filtrados.reduce((a, c) => a + (c.financeiro.global || 0), 0);
  const totalDesembolsado = filtrados.reduce((a, c) => a + (c.financeiro.desembolsado || 0), 0);

  const erro = erroPortal || erroSiconv || erroTransferegov;

  return (
    <div style={{ minHeight: '100vh', background: colors.surface, padding: layout.pagePadding }}>
      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, margin: '0 0 4px', color: '#16213e' }}>Monitoramento de Equipamentos — Convênios (MS)</h1>
        <p style={{ color: colors.mutedText, fontSize: 13, maxWidth: 900, lineHeight: 1.6, marginBottom: 20 }}>
          Página separada da análise de mérito de hipo/hipersuficiência do SIEO — 71 convênios de aquisição de
          equipamento já validados (<code>backend/scripts/validar_convenios.py</code>), com Portal da Transparência +
          SICONV legado + TransfereGov novo mesclados num registro só por convênio.
        </p>

        {erro && <p style={{ color: colors.hipoRed }}>Erro ao carregar dados: {erro}</p>}

        {!convenios ? (
          <p style={{ color: colors.mutedText }}>Carregando...</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: layout.cardGap, flexWrap: 'wrap', marginBottom: 20 }}>
              <KpiCard label="Convênios" value={filtrados.length} color={colors.primary} />
              <KpiCard label="Valor global total" value={fmtMoeda(totalGlobal)} color={colors.primary} />
              <KpiCard label="Valor desembolsado total" value={fmtMoeda(totalDesembolsado)} color={colors.hiperGreen} />
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <SearchInput value={busca} onChange={setBusca} placeholder="Buscar por convenente, município, número, CNPJ..." />
              <SingleSelectFilter placeholder="Todas as UFs" options={ufs} value={uf} onChange={setUf} clearLabel="Todas as UFs" minWidth={160} />
            </div>

            <div style={{ color: colors.mutedText, fontSize: 12, marginBottom: 10 }}>
              {filtrados.length} de {convenios.length} convênio(s)
            </div>

            {filtrados.map((c) => <ConvenioCard key={c.numero} c={c} />)}
          </>
        )}
      </div>
    </div>
  );
}
