import { useEffect, useState } from 'react';
import { MetricStrip } from '@/components/common/metric-strip';
import { PageHeader } from '@/components/common/page-header';
import { FilterWorkspace } from '@/components/common/filter-workspace';
import { ErrorAlert } from '@/components/common/error-alert';
import { mensagemSeguraDoErro } from '@/lib/api-error';
import { Skeleton } from '@/components/ui/skeleton';
import { NavBoxesAnaliseMerito } from '@/components/features/nav-boxes-analise-merito';
import { MultiSelectFilter } from '@/components/common/multi-select-filter';
import { CoberturaTable } from '@/components/features/cobertura-table';
import { EstabelecimentoTable } from '@/components/features/estabelecimento-table';
import { InfoIcon } from '@/components/features/info-icon';
import { NivelCoberturaTable } from '@/components/features/nivel-cobertura-table';
import { StatusFilterButtons } from '@/components/features/status-filter-buttons';
import { useFiltrosMacro } from '@/hooks/useFiltrosMacro';
import { useDashboardCobertura } from '@/hooks/useDashboardCobertura';
import { useDashboardTotais } from '@/hooks/useDashboardTotais';
import { useDashboardHipo } from '@/hooks/useDashboardHipo';
import { useFamiliaEquipamento } from '@/hooks/use-familia-equipamento';
import { REGIOES } from '@/data/constants';
import type { StatusCobertura } from '@/types/domain';

export function DashboardPage() {
  const { familia: FAMILIA } = useFamiliaEquipamento();
  const { macros, coberturaRows, facilities, isLoading, isError, error } = useDashboardCobertura(FAMILIA);

  const [statusFiltro, setStatusFiltro] = useState<Set<StatusCobertura>>(new Set());
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

  const { municipiosHipo, regioesSaudeHipo, regioesSaudeTotal } = useDashboardHipo({
    equipmentFamily: FAMILIA,
    states: estadosFiltro,
    macroCodes: macrosFiltro,
    healthRegionCodes: regioesSaudeFiltro,
    municipalities: municipiosFiltro,
  });

  const { totais } = useDashboardTotais({
    equipmentFamily: FAMILIA,
    states: estadosFiltro,
    macroCodes: macrosFiltro,
    healthRegionCodes: regioesSaudeFiltro,
    municipalities: municipiosFiltro,
    cnesCodes: cnesFiltro,
  });

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

  const header = (
    <PageHeader
      eyebrow="Análise de mérito"
      title="Parâmetros de necessidade"
      description="Cobertura, déficit e distância segundo a oferta em uso SUS."
      actions={<NavBoxesAnaliseMerito />}
    />
  );

  if (isLoading) {
    return (
      <div>
        {header}
        <div className="grid gap-2" role="status" aria-label="Carregando">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        {header}
        <ErrorAlert mensagem={mensagemSeguraDoErro(error)} />
      </div>
    );
  }

  return (
    <div>
      {header}

      <FilterWorkspace hasAnyFilter={hasAnyFilter} onClear={limparFiltros}>
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
      </FilterWorkspace>

      <MetricStrip
        items={[
          {
            key: 'total',
            label: 'Total de Equipamentos',
            value: totais?.existingQty ?? totalEquipGeralMacro,
            variant: 'primary',
            info: (
              <InfoIcon>
                Inclui equipamentos privados. Só o card ao lado (em uso e SUS) entra no cálculo de cobertura.
              </InfoIcon>
            ),
          },
          {
            key: 'total-sus',
            label: 'Total de Equipamentos em uso SUS',
            value: totais?.availableQty ?? totalEquipMacro,
            variant: 'primary',
          },
          {
            key: 'municipios-hipo',
            label: 'Municípios Hipossuficientes',
            value: municipiosHipo ?? '—',
            variant: 'destructive',
            onClick: () => verHipo('municipio'),
            ativo: nivelForcado === 'municipio',
            info: (
              <InfoIcon>
                Municípios com mais de 100 mil habitantes e equipamentos em uso SUS abaixo do necessário. Clique pra ver a
                lista.
              </InfoIcon>
            ),
          },
          {
            key: 'regioes-saude-hipo',
            label: 'Regiões de Saúde Hipossuficientes',
            value: regioesSaudeHipo != null && regioesSaudeTotal != null ? `${regioesSaudeHipo} de ${regioesSaudeTotal}` : '—',
            variant: 'destructive',
            onClick: () => verHipo('regiaoSaude'),
            ativo: nivelForcado === 'regiaoSaude',
            info: <InfoIcon>Regiões de saúde com equipamentos em uso SUS abaixo do necessário. Clique pra ver a lista.</InfoIcon>,
          },
          {
            key: 'macros-hipo',
            label: 'Macrorregiões com Hipossuficiente',
            value: `${macrosHipo} de ${filteredRows.length}`,
            variant: 'destructive',
            onClick: () => verHipo('macro'),
            ativo: nivelForcado === 'macro',
          },
        ]}
      />

      <div className="mt-5 rounded-lg bg-card">
        <div className="flex flex-col items-stretch gap-3 border-b border-border px-4.5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="text-sm font-semibold">Cobertura Assistencial</div>
            {nivelForcado && (
              <button
                onClick={sairDoHipo}
                className="cursor-pointer rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-[11px] font-semibold text-destructive"
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
