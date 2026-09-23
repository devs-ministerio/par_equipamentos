import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { ErrorAlert } from '@/components/common/error-alert';
import { mensagemSeguraDoErro } from '@/lib/api-error';
import { Skeleton } from '@/components/ui/skeleton';
import { NavBoxesAnaliseMerito } from '@/components/features/nav-boxes-analise-merito';
import { DashboardConteudo } from '@/components/features/dashboard-conteudo';
import { useFiltrosMacro } from '@/hooks/useFiltrosMacro';
import { useDashboardCobertura } from '@/hooks/useDashboardCobertura';
import { useDashboardTotais } from '@/hooks/useDashboardTotais';
import { useDashboardHipo } from '@/hooks/useDashboardHipo';
import { useFamiliaEquipamento } from '@/hooks/use-familia-equipamento';
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

  return <div>{header}<DashboardConteudo familia={FAMILIA} macros={macros} rows={filteredRows} filtros={{ regioes: filtroRegioes, ufs: filtroUfs, macros: filtroMacros, regioesSaude: filtroRegioesSaude, municipios: filtroMunicipios, cnes: filtroCnes }} options={{ uf: ufOptions, macro: macroOptions, regiaoSaude: regiaoSaudeOptions, municipio: municipioOptions, cnes: cnesOptions }} hasAnyFilter={hasAnyFilter} limparFiltros={limparFiltros} totais={totais} totalEquipMacro={totalEquipMacro} totalEquipGeralMacro={totalEquipGeralMacro} municipiosHipo={municipiosHipo} regioesSaudeHipo={regioesSaudeHipo} regioesSaudeTotal={regioesSaudeTotal} macrosHipo={macrosHipo} nivelTabela={nivelTabela} nivelForcado={nivelForcado} statusFiltro={statusFiltro} setStatusFiltro={setStatusFiltro} verHipo={verHipo} sairDoHipo={sairDoHipo} setFiltroRegioes={setFiltroRegioes} setFiltroUfs={setFiltroUfs} setFiltroMacros={setFiltroMacros} setFiltroRegioesSaude={setFiltroRegioesSaude} setFiltroMunicipios={setFiltroMunicipios} setFiltroCnes={setFiltroCnes} /></div>;
}
