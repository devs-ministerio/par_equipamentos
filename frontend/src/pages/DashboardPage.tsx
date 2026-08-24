import { useEffect, useState } from 'react';
import { KpiCard } from '../components/dashboard/KpiCard';
import { MultiSelectFilter } from '../components/dashboard/MultiSelectFilter';
import { CoberturaTable } from '../components/dashboard/CoberturaTable';
import { NivelCoberturaTable } from '../components/dashboard/NivelCoberturaTable';
import { EstabelecimentoTable } from '../components/dashboard/EstabelecimentoTable';
import { StatusFilterButtons } from '../components/common/StatusFilterButtons';
import { InfoIcon } from '../components/common/InfoIcon';
import {
  fetchEquipmentTotals,
  fetchFacilities,
  fetchHealthRegionCoverage,
  fetchMacroCoverage,
  fetchMunicipalityCoverage,
} from '../services/api';
import type { EquipmentTotals, FacilityOption } from '../services/api';
import { useFiltrosMacro } from '../hooks/useFiltrosMacro';
import { useFamiliaEquipamento } from '../context/FamiliaEquipamentoContext';
import { colors } from '../styles/tokens';
import { REGIOES } from '../data/constants';
import type { CoberturaRow, Macrorregiao, StatusCobertura } from '../types/domain';

export function DashboardPage() {
  const { familia: FAMILIA } = useFamiliaEquipamento();
  const [macros, setMacros] = useState<Macrorregiao[]>([]);
  const [coberturaRows, setCoberturaRows] = useState<CoberturaRow[]>([]);
  const [facilities, setFacilities] = useState<FacilityOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFiltro, setStatusFiltro] = useState<Set<StatusCobertura>>(new Set());
  const [totais, setTotais] = useState<EquipmentTotals | null>(null);
  const [municipiosHipo, setMunicipiosHipo] = useState<number | null>(null);
  const [regioesSaudeHipo, setRegioesSaudeHipo] = useState<number | null>(null);
  const [regioesSaudeTotal, setRegioesSaudeTotal] = useState<number | null>(null);
  // Forca a tabela "Cobertura Assistencial" pro nivel escolhido mesmo sem um
  // filtro geografico daquele nivel especifico selecionado -- so os cards de
  // Hipo acionam isso (clicar neles quer dizer "me mostra a lista", nao
  // "eu escolhi uma regiao/cidade"). Zerado junto com statusFiltro sempre que
  // o filtro geografico principal muda.
  const [nivelForcado, setNivelForcado] = useState<'macro' | 'regiaoSaude' | 'municipio' | null>(null);

  const {
    filtroRegioes,
    filtroUfs,
    filtroMacros,
    filtroRegioesSaude,
    filtroMunicipios,
    filtroCnes,
    setFiltroRegioes,
    setFiltroUfs,
    setFiltroMacros,
    setFiltroRegioesSaude,
    setFiltroMunicipios,
    setFiltroCnes,
    ufOptions,
    macroOptions,
    regiaoSaudeOptions,
    municipioOptions,
    cnesOptions,
    filteredRows,
    estadosFiltro,
    macrosFiltro,
    regioesSaudeFiltro,
    municipiosFiltro,
    cnesFiltro,
    hasAnyFilter,
    limparFiltros,
  } = useFiltrosMacro({ macros, coberturaRows, facilities });

  // Re-roda ao trocar a familia selecionada no menu (SeletorEquipamento) --
  // guarda contra corrida igual os outros efeitos: trocar de familia
  // rapido (TOMOGRAFO -> RESSONANCIA -> TOMOGRAFO) pode fazer a resposta da
  // familia anterior chegar depois da nova e sobrescrever o dado certo.
  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setError(null);
    Promise.all([fetchMacroCoverage(FAMILIA), fetchFacilities(FAMILIA)])
      .then(([coverage, facilityOptions]) => {
        if (cancelado) return;
        setMacros(coverage.macros);
        setCoberturaRows(coverage.coberturaRows);
        setFacilities(facilityOptions);
      })
      .catch((e: Error) => !cancelado && setError(e.message))
      .finally(() => !cancelado && setLoading(false));
    return () => {
      cancelado = true;
    };
  }, [FAMILIA]);

  const estadosKey = estadosFiltro?.join(',') ?? '';
  const macrosKey = macrosFiltro?.join(',') ?? '';
  const regioesSaudeKey = regioesSaudeFiltro?.join(',') ?? '';
  const municipiosKey = municipiosFiltro?.join(',') ?? '';
  const cnesKey = cnesFiltro?.join(',') ?? '';

  // Zera o filtro Hiper/Hipo sempre que qualquer filtro geografico principal
  // muda -- senao um recorte de status escolhido pro filtro anterior (ex.:
  // "só Hipossuficiente" numa UF) fica silenciosamente aplicado ao trocar de
  // UF/macro/regiao/municipio/CNES, escondendo linhas sem o usuario perceber.
  useEffect(() => {
    setStatusFiltro(new Set());
    setNivelForcado(null);
  }, [FAMILIA, estadosKey, macrosKey, regioesSaudeKey, municipiosKey, cnesKey]);

  // Contagens dos cards clicaveis "Municípios Hipossuficientes" e "Regiões
  // de Saúde Hipossuficientes" -- mesmo recorte geografico dos outros cards, mas
  // sempre com o corte de 100 mil habitantes pro nivel Municipio (RN
  // especifica de TOMOGRAFO: municipio menor nunca foi esperado ter
  // equipamento proprio, ver Metodologia) independente de
  // semCorteDePopulacao (que so vale quando o USUARIO ja escolheu um
  // municipio/CNES especifico).
  //
  // Guarda contra corrida (mesmo bug de NivelCoberturaTable, corrigido
  // 2026-08-22): selecionar um CNES cascateia pro Municipio num segundo
  // instante, entao um pedido SEM filtro de municipio dispara primeiro
  // (mais lento, lista nacional) e um pedido JA filtrado dispara logo
  // depois (mais rapido) -- sem essa guarda, a resposta lenta e desfiltrada
  // chegava por ultimo e sobrescrevia o card com o numero nacional errado.
  useEffect(() => {
    let cancelado = false;

    fetchMunicipalityCoverage({
      equipmentFamily: FAMILIA,
      states: estadosFiltro,
      macroCodes: macrosFiltro,
      healthRegionCodes: regioesSaudeFiltro,
      municipalities: municipiosFiltro,
      minPopulation: 100_000,
    })
      .then((rows) => {
        if (!cancelado) setMunicipiosHipo(rows.filter((r) => r.status === 'Hipossuficiente').length);
      })
      .catch(() => !cancelado && setMunicipiosHipo(null));

    fetchHealthRegionCoverage({ equipmentFamily: FAMILIA, states: estadosFiltro, macroCodes: macrosFiltro })
      .then((rows) => {
        if (cancelado) return;
        setRegioesSaudeHipo(rows.filter((r) => r.status === 'Hipossuficiente').length);
        setRegioesSaudeTotal(rows.length);
      })
      .catch(() => {
        if (cancelado) return;
        setRegioesSaudeHipo(null);
        setRegioesSaudeTotal(null);
      });

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [FAMILIA, estadosKey, macrosKey, regioesSaudeKey, municipiosKey]);

  // Total de Equipamentos / Total de Equipamentos SUS vem direto de
  // equipment_offer_row (soma exata pro recorte pedido), nao de
  // macro-coverage (agregado so por macro) -- senao filtrar por um
  // Município/Região de Saúde/CNES mostraria o total da macro inteira em vez
  // do recorte real (bug corrigido em 2026-08-21). Mesma guarda contra
  // corrida do efeito acima.
  useEffect(() => {
    let cancelado = false;

    fetchEquipmentTotals({
      equipmentFamily: FAMILIA,
      states: estadosFiltro,
      macroCodes: macrosFiltro,
      healthRegionCodes: regioesSaudeFiltro,
      municipalities: municipiosFiltro,
      cnesCodes: cnesFiltro,
    })
      .then((res) => !cancelado && setTotais(res))
      .catch(() => !cancelado && setTotais(null));

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [FAMILIA, estadosKey, macrosKey, regioesSaudeKey, municipiosKey, cnesKey]);


  // fallback dos cards "Total de Equipamentos"/"Total de Equipamentos SUS"
  // enquanto fetchEquipmentTotals ainda nao respondeu (ou falhou) -- soma
  // por macro, nao e exata pra filtro mais fino que macro, mas e melhor que
  // mostrar "--" nesse intervalo curto.
  const totalEquipMacro = filteredRows.reduce((s, r) => s + r.oferta, 0);
  const totalEquipGeralMacro = filteredRows.reduce((s, r) => s + r.ofertaTotal, 0);
  // Nivel da tabela "Cobertura Assistencial": nivelForcado (acionado pelos
  // cards de Hipo) tem prioridade; senao, Municipio/CNES -> municipio; so
  // Regiao de Saude -> regiao de saude; UF/Macro/nenhum filtro -> macro
  // (decisao 2026-08-21). Municipio/CNES tem prioridade sobre Regiao de
  // Saude porque escolher um municipio ou CNES especifico ja implica (via
  // cascata do hook) a regiao de saude dele tambem estar marcada.
  const nivelTabela: 'macro' | 'regiaoSaude' | 'municipio' =
    nivelForcado ?? (municipiosFiltro || cnesFiltro ? 'municipio' : regioesSaudeFiltro ? 'regiaoSaude' : 'macro');
  const macrosHipo = filteredRows.filter((r) => r.status === 'Hipossuficiente').length;

  // Clique nos cards de Hipo -- mostra a lista (forca o nivel da tabela)
  // e ja filtra por Hipossuficiente. Clicar de novo no MESMO card ja ativo
  // sai da visão Hipo (senao nao tinha como desligar sem mexer no
  // filtro geografico -- duvida real do usuario, 2026-08-22).
  function verHipo(nivel: 'macro' | 'regiaoSaude' | 'municipio') {
    if (nivelForcado === nivel) {
      sairDoHipo();
    } else {
      setNivelForcado(nivel);
      setStatusFiltro(new Set(['Hipossuficiente']));
    }
  }

  function sairDoHipo() {
    setNivelForcado(null);
    setStatusFiltro(new Set());
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.subtleText }}>Carregando dados...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 24, background: '#fde8e8', color: colors.hipoRed, borderRadius: 8 }}>
        Não foi possível carregar os dados da API ({error}). Confirme se o backend está rodando em{' '}
        {import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'}.
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          marginBottom: 16,
          padding: '14px 18px',
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: '#475066', whiteSpace: 'nowrap', paddingTop: 8 }}>
          Filtrar por
        </span>
        <MultiSelectFilter
          placeholder="CNES"
          options={cnesOptions}
          selected={filtroCnes}
          onChange={setFiltroCnes}
        />
        <MultiSelectFilter
          placeholder="Região"
          options={REGIOES.map((r) => ({ value: r, label: r }))}
          selected={filtroRegioes}
          onChange={(v) => {
            setFiltroRegioes(v);
            setFiltroUfs([]);
            setFiltroMacros([]);
            setFiltroRegioesSaude([]);
            setFiltroMunicipios([]);
            setFiltroCnes([]);
          }}
        />
        <MultiSelectFilter
          placeholder="Estado (UF)"
          options={ufOptions}
          selected={filtroUfs}
          onChange={(v) => {
            setFiltroUfs(v);
            setFiltroMacros([]);
            setFiltroRegioesSaude([]);
            setFiltroMunicipios([]);
            setFiltroCnes([]);
          }}
        />
        <MultiSelectFilter
          placeholder="Macrorregião de Saúde"
          options={macroOptions}
          selected={filtroMacros}
          onChange={(v) => {
            setFiltroMacros(v);
            setFiltroRegioesSaude([]);
            setFiltroMunicipios([]);
            setFiltroCnes([]);
          }}
        />
        <MultiSelectFilter
          placeholder="Região de Saúde"
          options={regiaoSaudeOptions}
          selected={filtroRegioesSaude}
          onChange={(v) => {
            setFiltroRegioesSaude(v);
            setFiltroMunicipios([]);
            setFiltroCnes([]);
          }}
        />
        <MultiSelectFilter
          placeholder="Município"
          options={municipioOptions}
          selected={filtroMunicipios}
          onChange={(v) => {
            setFiltroMunicipios(v);
            setFiltroCnes([]);
          }}
        />
        {hasAnyFilter && (
          <button
            onClick={limparFiltros}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              border: '1px solid #f0a0a0',
              background: '#fff0f0',
              color: '#c0392b',
            }}
          >
            ✕ Limpar
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'stretch' }}>
        <KpiCard
          label="Total de Equipamentos"
          value={totais?.existingQty ?? totalEquipGeralMacro}
          color="#16213e"
          info={
            <InfoIcon>
              Inclui equipamentos privados. Só o card ao lado (SUS) entra no cálculo de cobertura.
            </InfoIcon>
          }
        />
        <KpiCard
          label="Total de Equipamentos SUS"
          value={totais?.availableQty ?? totalEquipMacro}
          color="#16213e"
        />
        <KpiCard
          label="Municípios Hipossuficientes"
          value={municipiosHipo ?? '—'}
          color="#a32d2d"
          onClick={() => verHipo('municipio')}
          ativo={nivelForcado === 'municipio'}
          info={
            <InfoIcon>
              Municípios com mais de 100 mil habitantes e equipamentos SUS abaixo do necessário. Clique pra ver a
              lista.
            </InfoIcon>
          }
        />
        <KpiCard
          label="Regiões de Saúde Hipossuficientes"
          value={regioesSaudeHipo != null && regioesSaudeTotal != null ? `${regioesSaudeHipo} de ${regioesSaudeTotal}` : '—'}
          color="#a32d2d"
          onClick={() => verHipo('regiaoSaude')}
          ativo={nivelForcado === 'regiaoSaude'}
          info={
            <InfoIcon>Regiões de saúde com equipamentos SUS abaixo do necessário. Clique pra ver a lista.</InfoIcon>
          }
        />
        <KpiCard
          label="Macrorregiões com Hipossuficiente"
          value={`${macrosHipo} de ${filteredRows.length}`}
          color="#a32d2d"
          onClick={() => verHipo('macro')}
          ativo={nivelForcado === 'macro'}
        />
      </div>

      <div style={{ background: '#fff', borderRadius: 8, marginTop: 20 }}>
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid #eef0f4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Cobertura Assistencial</div>
            {nivelForcado && (
              <button
                onClick={sairDoHipo}
                style={{
                  padding: '4px 10px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: '1px solid #f0a0a0',
                  background: '#fff0f0',
                  color: '#c0392b',
                }}
              >
                ✕ Sair da visão Hipo
              </button>
            )}
          </div>
          <StatusFilterButtons selecionados={statusFiltro} onChange={setStatusFiltro} />
        </div>
        {nivelTabela === 'macro' && (
          <CoberturaTable
            equipmentFamily={FAMILIA}
            rows={filteredRows}
            macros={macros}
            subNivelSelecionados={[...filtroRegioesSaude, ...filtroMunicipios]}
            statusFiltro={statusFiltro}
          />
        )}
        {nivelTabela !== 'macro' && (
          <NivelCoberturaTable
            equipmentFamily={FAMILIA}
            nivel={nivelTabela}
            states={estadosFiltro}
            macroCodes={macrosFiltro}
            healthRegionCodes={regioesSaudeFiltro}
            municipalities={municipiosFiltro}
            semCorteDePopulacao={Boolean(municipiosFiltro || cnesFiltro)}
            statusFiltro={statusFiltro}
            subNivelSelecionados={[...filtroRegioesSaude, ...filtroMunicipios]}
          />
        )}
      </div>
      <EstabelecimentoTable
        equipmentFamily={FAMILIA}
        states={estadosFiltro}
        macroCodes={macrosFiltro}
        healthRegionCodes={regioesSaudeFiltro}
        municipalities={municipiosFiltro}
        cnesCodes={cnesFiltro}
      />
    </div>
  );
}
