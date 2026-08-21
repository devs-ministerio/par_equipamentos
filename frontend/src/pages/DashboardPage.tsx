import { useEffect, useState } from 'react';
import { KpiCard } from '../components/dashboard/KpiCard';
import { MultiSelectFilter } from '../components/dashboard/MultiSelectFilter';
import { CoberturaTable } from '../components/dashboard/CoberturaTable';
import { NivelCoberturaTable } from '../components/dashboard/NivelCoberturaTable';
import { EstabelecimentoTable } from '../components/dashboard/EstabelecimentoTable';
import { StatusFilterButtons } from '../components/common/StatusFilterButtons';
import { InfoIcon } from '../components/common/InfoIcon';
import { ExportPdfModal } from '../components/modals/ExportPdfModal';
import { ExportXlsxModal } from '../components/modals/ExportXlsxModal';
import { fetchEquipmentTotals, fetchFacilities, fetchMacroCoverage } from '../services/api';
import type { EquipmentTotals, FacilityOption } from '../services/api';
import { useFiltrosMacro } from '../hooks/useFiltrosMacro';
import { formatMilhar, formatMultiplicador } from '../utils/format';
import { colors } from '../styles/tokens';
import { REGIOES } from '../data/constants';
import type { CoberturaRow, Macrorregiao, StatusCobertura } from '../types/domain';

const FAMILIA = 'TOMOGRAFO';

export function DashboardPage() {
  const [macros, setMacros] = useState<Macrorregiao[]>([]);
  const [coberturaRows, setCoberturaRows] = useState<CoberturaRow[]>([]);
  const [facilities, setFacilities] = useState<FacilityOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedCnes, setExpandedCnes] = useState<Set<string>>(new Set());
  const [statusFiltro, setStatusFiltro] = useState<Set<StatusCobertura>>(new Set());
  const [totais, setTotais] = useState<EquipmentTotals | null>(null);
  const [exportPdfAberto, setExportPdfAberto] = useState(false);
  const [exportXlsxAberto, setExportXlsxAberto] = useState(false);

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
  } = useFiltrosMacro({ equipmentFamily: FAMILIA, macros, coberturaRows, facilities });

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchMacroCoverage(FAMILIA), fetchFacilities(FAMILIA)])
      .then(([coverage, facilityOptions]) => {
        setMacros(coverage.macros);
        setCoberturaRows(coverage.coberturaRows);
        setFacilities(facilityOptions);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const estadosKey = estadosFiltro?.join(',') ?? '';
  const macrosKey = macrosFiltro?.join(',') ?? '';
  const regioesSaudeKey = regioesSaudeFiltro?.join(',') ?? '';
  const municipiosKey = municipiosFiltro?.join(',') ?? '';
  const cnesKey = cnesFiltro?.join(',') ?? '';

  // Total de Tomógrafos / Total de Tomógrafos SUS vem direto de
  // equipment_offer_row (soma exata pro recorte pedido), nao de
  // macro-coverage (agregado so por macro) -- senao filtrar por um
  // Município/Região de Saúde/CNES mostraria o total da macro inteira em vez
  // do recorte real (bug corrigido em 2026-08-21).
  useEffect(() => {
    fetchEquipmentTotals({
      equipmentFamily: FAMILIA,
      states: estadosFiltro,
      macroCodes: macrosFiltro,
      healthRegionCodes: regioesSaudeFiltro,
      municipalities: municipiosFiltro,
      cnesCodes: cnesFiltro,
    })
      .then(setTotais)
      .catch(() => setTotais(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadosKey, macrosKey, regioesSaudeKey, municipiosKey, cnesKey]);

  function toggleExpand(cnes: string) {
    setExpandedCnes((prev) => {
      const next = new Set(prev);
      next.has(cnes) ? next.delete(cnes) : next.add(cnes);
      return next;
    });
  }

  // usados so no calculo de "pessoas por tomógrafo"/"multiplicador da meta"
  // abaixo -- esses dois dependem de populacao, que so existe agregada por
  // macro (nao ha populacao por município na base), entao continuam na
  // granularidade da macro mesmo quando o filtro escolhido e mais fino.
  const totalEquipMacro = filteredRows.reduce((s, r) => s + r.oferta, 0);
  const totalEquipGeralMacro = filteredRows.reduce((s, r) => s + r.ofertaTotal, 0);
  // Região de Saúde / Município / CNES sao mais finos que macro -- os cards
  // de população/cobertura (que só existem por macro) ficam com uma ressalva
  // quando algum desses estiver filtrado.
  const granularidadeFina = Boolean(regioesSaudeFiltro || municipiosFiltro || cnesFiltro);
  // Nivel da tabela "Cobertura Assistencial": Municipio/CNES -> municipio;
  // so Regiao de Saude -> regiao de saude; UF/Macro/nenhum filtro -> macro
  // (decisao 2026-08-21). Municipio/CNES tem prioridade sobre Regiao de
  // Saude porque escolher um municipio ou CNES especifico ja implica (via
  // cascata do hook) a regiao de saude dele tambem estar marcada.
  const nivelTabela: 'macro' | 'regiaoSaude' | 'municipio' =
    municipiosFiltro || cnesFiltro ? 'municipio' : regioesSaudeFiltro ? 'regiaoSaude' : 'macro';
  const macrosHipo = filteredRows.filter((r) => r.status === 'Hipossuficiente').length;
  const coberturaMedia = filteredRows.length
    ? Math.round((filteredRows.reduce((s, r) => s + r.cobertura, 0) / filteredRows.length) * 10) / 10
    : 0;
  // soma populacao / soma oferta (nao media das razoes por macro) -- mesma
  // logica ponderada usada pra "pessoas por equipamento" na CoberturaTable.
  const totalPop = filteredRows.reduce((s, r) => s + (macros.find((m) => m.id === r.macroId)?.pop ?? 0), 0);
  const pessoasPorTomografo = totalEquipMacro > 0 ? totalPop / totalEquipMacro : null;

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
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setExportPdfAberto(true)}
            style={{
              padding: '7px 16px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              border: `1px solid ${colors.border}`,
              background: '#fff',
              color: colors.hipoRed,
            }}
          >
            ⬇ PDF
          </button>
          <button
            onClick={() => setExportXlsxAberto(true)}
            style={{
              padding: '7px 16px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              border: `1px solid ${colors.border}`,
              background: '#fff',
              color: colors.hiperGreen,
            }}
          >
            ⬇ XLSX
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'stretch' }}>
        <KpiCard
          label="Total de Tomógrafos"
          value={totais?.existingQty ?? totalEquipGeralMacro}
          color="#16213e"
          info={
            <InfoIcon>
              Inclui tomógrafos SUS e não-SUS (privados). Não entra no cálculo de cobertura — só o card "Total de
              Tomógrafos SUS" ao lado representa capacidade disponível pro paciente do SUS.
            </InfoIcon>
          }
        />
        <KpiCard label="Total de Tomógrafos SUS" value={totais?.availableQty ?? totalEquipMacro} color="#16213e" />
        <KpiCard label="Macrorregiões com Hipossuficiente" value={`${macrosHipo} de ${filteredRows.length}`} color="#a32d2d" />
        <KpiCard
          label={'Pessoas por tomógrafo'}
          value={pessoasPorTomografo != null ? `${formatMilhar(pessoasPorTomografo)}/1` : '—'}
          color={coberturaMedia >= 100 ? '#3b6d11' : '#ba7517'}
          info={
            <InfoIcon>
              <div>
                População <strong>SUS-dependente</strong> (IBGE ao vivo do SIDRA − beneficiários de plano de saúde
                via ANS) dividida pelos tomógrafos SUS — quem tem plano privado não compete pela vaga no SUS.
              </div>
              {granularidadeFina && (
                <div style={{ marginTop: 8, fontSize: 10, color: '#f0b429' }}>
                  População e cobertura só existem por macrorregião de saúde — com filtro de Região de Saúde,
                  Município ou CNES aplicado, esse número reflete a(s) macrorregião(ões) inteira(s) do recorte
                  escolhido, não só a área filtrada.
                </div>
              )}
            </InfoIcon>
          }
        />
        <KpiCard
          label={'Multiplicador da meta (100k/aparelho)'}
          value={formatMultiplicador(coberturaMedia / 100)}
          color={coberturaMedia >= 100 ? '#3b6d11' : '#ba7517'}
          info={
            <InfoIcon>
              <div style={{ fontWeight: 700, marginBottom: 6, color: '#93c5fd' }}>Parâmetro normativo</div>
              <div>
                1 tomógrafo por <strong>100 mil habitantes SUS-dependentes</strong>
              </div>
              <div style={{ marginTop: 8, fontWeight: 700, color: '#93c5fd' }}>Fórmula</div>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 11,
                  marginTop: 4,
                  background: 'rgba(255,255,255,0.08)',
                  padding: '6px 8px',
                  borderRadius: 4,
                }}
              >
                População SUS-dependente ÷ Tomógrafos SUS ÷ 100 mil
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: '#94a3b8' }}>
                SUS-dependente = população IBGE (ao vivo, SIDRA) − beneficiários de plano de saúde (ANS, arquivo de
                referência) — consistente com a oferta já ser só a quantidade SUS.
              </div>
              {granularidadeFina && (
                <div style={{ marginTop: 8, fontSize: 10, color: '#f0b429' }}>
                  População e cobertura só existem por macrorregião — com Região de Saúde, Município ou CNES
                  filtrado, este número reflete a(s) macrorregião(ões) inteira(s) do recorte, não só a área filtrada.
                </div>
              )}
              <div style={{ marginTop: 8, fontSize: 10, color: '#94a3b8' }}>
                Ex.: 3,90x significa que a região tem quase 4 vezes a quantidade de tomógrafos exigida pela meta —
                quanto maior o multiplicador, maior a capacidade ociosa da região, ou seja, mais vaga disponível pra
                atender demanda adicional.
              </div>
            </InfoIcon>
          }
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
          <div style={{ fontWeight: 600, fontSize: 14 }}>Cobertura Assistencial</div>
          <StatusFilterButtons selecionados={statusFiltro} onChange={setStatusFiltro} />
        </div>
        {nivelTabela === 'macro' && (
          <CoberturaTable
            equipmentFamily={FAMILIA}
            rows={filteredRows}
            macros={macros}
            onSelecionarMunicipio={(chave, macroId, regiaoSaudeCodigo) => {
              setFiltroMunicipios((prev) => (prev.includes(chave) ? prev.filter((v) => v !== chave) : [...prev, chave]));
              // so adiciona a macro/regiao de saude (nunca remove sozinho ao
              // desmarcar cidade) -- mesma regra da cascata automatica de
              // Municipio/Macro/Regiao de Saude -> UF/Regiao.
              setFiltroMacros((prev) => (prev.includes(macroId) ? prev : [...prev, macroId]));
              if (regiaoSaudeCodigo) {
                setFiltroRegioesSaude((prev) => (prev.includes(regiaoSaudeCodigo) ? prev : [...prev, regiaoSaudeCodigo]));
              }
            }}
            municipiosSelecionados={filtroMunicipios}
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
        expanded={expandedCnes}
        onToggleExpand={toggleExpand}
      />

      {exportPdfAberto && (
        <ExportPdfModal
          onClose={() => setExportPdfAberto(false)}
          equipmentFamily={FAMILIA}
          macros={macros}
          coberturaRowsTodas={coberturaRows}
          facilities={facilities}
          filtrosIniciais={{
            regioes: filtroRegioes,
            ufs: filtroUfs,
            macros: filtroMacros,
            regioesSaude: filtroRegioesSaude,
            municipios: filtroMunicipios,
            cnes: filtroCnes,
          }}
        />
      )}

      {exportXlsxAberto && (
        <ExportXlsxModal
          onClose={() => setExportXlsxAberto(false)}
          equipmentFamily={FAMILIA}
          macros={macros}
          coberturaRowsTodas={coberturaRows}
          facilities={facilities}
          filtrosIniciais={{
            regioes: filtroRegioes,
            ufs: filtroUfs,
            macros: filtroMacros,
            regioesSaude: filtroRegioesSaude,
            municipios: filtroMunicipios,
            cnes: filtroCnes,
          }}
        />
      )}
    </div>
  );
}
