import { UF_INFO } from '../data/geoReference';
import type {
  CoberturaRow,
  EstabelecimentoRow,
  Macrorregiao,
  NivelCoberturaRow,
  StatusCobertura,
  TipoEquipamento,
} from '../types/domain';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

// Formato exato devolvido por GET /macro-coverage (backend/app/schemas.py::MacroCoverageRead)
interface MacroCoverageApi {
  id: number;
  execution_id: number;
  macro_code: string;
  macro_name: string;
  state: string;
  equipment_family: string;
  population: number | null; // SUS-dependente -- usado no calculo
  population_residente: number | null; // so informativo (IBGE, ao vivo)
  population_ans: number | null; // so informativo (beneficiarios de plano de saude)
  estimated_need: number | null;
  required_qty: number | null;
  available_qty: number | null;
  existing_qty: number | null;
  facility_count: number | null;
  balance: number | null;
  deficit_status: 'deficient' | 'not_deficient' | 'not_available';
  coverage_percentage: number | null;
}

// Formato exato devolvido por GET /equipment-offer-rows/establishments
// (backend/app/schemas.py::EstablishmentRead) -- ja agregado por CNES.
interface EstablishmentApi {
  cnes_code: string;
  facility_name: string | null;
  municipality_name: string | null;
  macro_code: string | null;
  macro_name: string | null;
  health_region_code: string | null;
  health_region_name: string | null;
  state: string;
  existing_qty: number;
  in_use_qty: number;
  sus_flag: boolean;
  latitude: number | null;
  longitude: number | null;
  types: TipoEquipamento[];
}

interface EstablishmentPageApi {
  items: EstablishmentApi[];
  total: number;
}

async function apiGet<T>(path: string, params?: Record<string, string | string[]>): Promise<T> {
  const url = new URL(path, API_BASE_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, item));
      else url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Falha ao consultar ${path}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// deficit_status tem 3 estados no backend (deficient/not_deficient/not_available)
// -- o terceiro (fonte desativada, RF-08) ainda nao tem tratamento visual
// dedicado no front; cai em Hipossuficiente por enquanto (nao ocorre nos
// dados de hoje, so no seed real do Modulo 5 isso passa a importar).
function toStatus(deficitStatus: MacroCoverageApi['deficit_status']): StatusCobertura {
  return deficitStatus === 'not_deficient' ? 'Hiperssuficiente' : 'Hipossuficiente';
}

function toEstabelecimentoRow(r: EstablishmentApi): EstabelecimentoRow {
  return {
    cnes: r.cnes_code,
    nome: r.facility_name ?? '(sem nome cadastrado)',
    municipio: r.municipality_name ?? '',
    uf: r.state,
    macroId: r.macro_code,
    macroNome: r.macro_name,
    regiaoSaudeId: r.health_region_code,
    regiaoSaudeNome: r.health_region_name,
    tipos: r.types,
    qtd: r.existing_qty,
    qtdUso: r.in_use_qty,
    susFlag: r.sus_flag,
    latitude: r.latitude,
    longitude: r.longitude,
  };
}

export interface MacroCoverageResult {
  macros: Macrorregiao[];
  coberturaRows: CoberturaRow[];
}

export async function fetchMacroCoverage(equipmentFamily: string, macroCodes?: string[]): Promise<MacroCoverageResult> {
  const query: Record<string, string | string[]> = { equipment_family: equipmentFamily };
  if (macroCodes?.length) query.macro_code = macroCodes;
  const rows = await apiGet<MacroCoverageApi[]>('/macro-coverage', query);

  const macros: Macrorregiao[] = rows.map((r) => {
    const geo = UF_INFO[r.state];
    return {
      id: r.macro_code,
      nome: r.macro_name,
      uf: r.state,
      regiao: geo?.regiao ?? 'Norte',
      pop: r.population ?? 0,
      popResidente: r.population_residente ?? 0,
      popAns: r.population_ans ?? 0,
      nomeEstado: geo?.nome ?? r.state,
    };
  });

  const coberturaRows: CoberturaRow[] = rows.map((r) => ({
    macroId: r.macro_code,
    oferta: r.available_qty ?? 0,
    ofertaTotal: r.existing_qty ?? 0,
    demanda: r.required_qty ?? 0,
    cobertura: r.coverage_percentage ?? 0,
    status: toStatus(r.deficit_status),
  }));

  return { macros, coberturaRows };
}


export interface EstabelecimentosParams {
  equipmentFamily: string;
  states?: string[];
  macroCodes?: string[];
  healthRegionCodes?: string[];
  municipalities?: string[];
  cnesCodes?: string[];
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page: number; // 1-indexado
  pageSize: number;
  /** Busca por raio geografico (km) em volta de um ponto, IGNORANDO fronteira
   * de macro/UF -- alternativa a macroCodes usada pelo recorte do Mapa
   * quando o usuario centraliza o raio de 75 km num municipio especifico
   * (o tomografo mais proximo pode estar numa macro vizinha). Quando
   * presente, `page`/`pageSize` sao ignorados no backend (devolve tudo
   * dentro do raio de uma vez, ver comentario no router). */
  near?: { lat: number; lon: number; radiusKm: number };
  /** Filtra so estabelecimento que atende SUS (fl_sus) -- usado pra achar
   * o "equipamento mais proximo" (Mapa), mesmo criterio que "oferta" ja
   * usa em todo o resto do app. */
  susOnly?: boolean;
}

export interface EstabelecimentosResult {
  items: EstabelecimentoRow[];
  total: number;
}

/** Paginacao de verdade -- filtro, busca e ordenacao acontecem no backend. */
export async function fetchEstabelecimentosPage(params: EstabelecimentosParams): Promise<EstabelecimentosResult> {
  const query: Record<string, string | string[]> = {
    equipment_family: params.equipmentFamily,
    sort_by: params.sortBy ?? 'facility_name',
    sort_dir: params.sortDir ?? 'asc',
    limit: String(params.pageSize),
    offset: String((params.page - 1) * params.pageSize),
  };
  if (params.states?.length) query.state = params.states;
  if (params.macroCodes?.length) query.macro_code = params.macroCodes;
  if (params.healthRegionCodes?.length) query.health_region_code = params.healthRegionCodes;
  if (params.municipalities?.length) query.municipality = params.municipalities;
  if (params.cnesCodes?.length) query.cnes_code = params.cnesCodes;
  if (params.search) query.search = params.search;
  if (params.near) {
    query.near_lat = String(params.near.lat);
    query.near_lon = String(params.near.lon);
    query.radius_km = String(params.near.radiusKm);
  }
  if (params.susOnly) query.sus_flag = 'true';

  const page = await apiGet<EstablishmentPageApi>('/equipment-offer-rows/establishments', query);
  return { items: page.items.map(toEstabelecimentoRow), total: page.total };
}

export interface TotaisParams {
  equipmentFamily: string;
  states?: string[];
  macroCodes?: string[];
  healthRegionCodes?: string[];
  municipalities?: string[];
  cnesCodes?: string[];
}

export interface EquipmentTotals {
  existingQty: number;
  availableQty: number; // so SUS -- mesma regra de "oferta" do macro_coverage (qt_existente_sus)
}

/**
 * Soma exata de equipment_offer_row pro recorte de filtro pedido -- ao
 * contrario de /macro-coverage (agregado so por macro), da o total certo
 * pra QUALQUER granularidade de filtro (regiao de saude, municipio, cnes).
 * Usado pelos cards "Total de Equipamentos" / "Total de Equipamentos SUS" do
 * Dashboard, que antes usavam a soma por macro e mostravam o total da
 * macro inteira mesmo filtrando por um municipio/CNES so.
 */
export async function fetchEquipmentTotals(params: TotaisParams): Promise<EquipmentTotals> {
  const query: Record<string, string | string[]> = { equipment_family: params.equipmentFamily };
  if (params.states?.length) query.state = params.states;
  if (params.macroCodes?.length) query.macro_code = params.macroCodes;
  if (params.healthRegionCodes?.length) query.health_region_code = params.healthRegionCodes;
  if (params.municipalities?.length) query.municipality = params.municipalities;
  if (params.cnesCodes?.length) query.cnes_code = params.cnesCodes;
  const r = await apiGet<{ existing_qty: number; available_qty: number }>('/equipment-offer-rows/totals', query);
  return { existingQty: r.existing_qty, availableQty: r.available_qty };
}

export interface NaturezaJuridicaBreakdown {
  naturezaJuridica: string;
  existingQty: number;
  availableQty: number;
}

/**
 * Quebra da oferta por natureza juridica do estabelecimento (Publico/Privado/
 * Sem fins lucrativos) -- Painel Geral, card "Natureza jurídica da oferta
 * SUS" (2026-08-22).
 */
export async function fetchLegalNatureBreakdown(equipmentFamily: string): Promise<NaturezaJuridicaBreakdown[]> {
  const rows = await apiGet<{ legal_nature: string; existing_qty: number; available_qty: number }[]>(
    '/equipment-offer-rows/by-legal-nature',
    { equipment_family: equipmentFamily },
  );
  return rows.map((r) => ({ naturezaJuridica: r.legal_nature, existingQty: r.existing_qty, availableQty: r.available_qty }));
}

// Formato exato devolvido por GET /equipment-offer-rows/facilities
// (backend/app/schemas.py::FacilityOptionRead).
interface FacilityOptionApi {
  cnes_code: string;
  facility_name: string | null;
  state: string;
  macro_code: string | null;
  macro_name: string | null;
  health_region_code: string | null;
  health_region_name: string | null;
  municipality_name: string | null;
}

export interface FacilityOption {
  cnes: string;
  nome: string;
  uf: string;
  macroId: string | null;
  macroNome: string | null;
  regiaoSaudeId: string | null;
  regiaoSaudeNome: string | null;
  /** "NOME|UF" -- mesma chave composta usada pelo filtro de Municipio. */
  municipioChave: string | null;
}

/**
 * Lista completa (sem filtro, sem paginacao) de estabelecimentos distintos
 * por CNES pra essa familia de equipamento -- buscada uma unica vez e usada
 * pelo front pra derivar localmente as opcoes de TODOS os filtros
 * (UF/Macro/Regiao de Saude/Municipio/CNES), cada um restringido pelos
 * demais ja selecionados (cascata totalmente bidirecional).
 */
export async function fetchFacilities(equipmentFamily: string): Promise<FacilityOption[]> {
  const rows = await apiGet<FacilityOptionApi[]>('/equipment-offer-rows/facilities', {
    equipment_family: equipmentFamily,
  });
  return rows.map((r) => ({
    cnes: r.cnes_code,
    nome: r.facility_name ?? '(sem nome cadastrado)',
    uf: r.state,
    macroId: r.macro_code,
    macroNome: r.macro_name,
    regiaoSaudeId: r.health_region_code,
    regiaoSaudeNome: r.health_region_name,
    municipioChave: r.municipality_name ? `${r.municipality_name}|${r.state}` : null,
  }));
}

// Formato exato devolvido por GET /municipality-coverage
// (backend/app/schemas.py::MunicipalityCoverageRead).
interface MunicipalityCoverageApi {
  ibge_code: string;
  municipality_name: string;
  health_region_code: string | null;
  health_region_name: string | null;
  macro_code: string | null;
  macro_name: string | null;
  state: string;
  population: number | null;
  population_residente: number | null;
  population_ans: number | null;
  existing_qty: number | null;
  available_qty: number | null;
  coverage_percentage: number | null;
  deficit_status: MacroCoverageApi['deficit_status'];
  // So informativo -- nao entra em deficit_status. Nulo pra familias cujo
  // pipeline ainda nao calcula (so TOMOGRAFO por enquanto, ver
  // backend/app/pipeline/geo.py).
  distance_km_nearest_equipment: number | null;
  // Coordenada da sede do municipio -- ver comentario em
  // backend/app/schemas.py::MunicipalityCoverageRead.
  latitude: number | null;
  longitude: number | null;
  // Codigo IBGE de 7 digitos -- ver mesmo comentario.
  ibge_code_7: string | null;
}

// Formato exato devolvido por GET /health-region-coverage
// (backend/app/schemas.py::HealthRegionCoverageRead).
interface HealthRegionCoverageApi {
  health_region_code: string;
  health_region_name: string;
  macro_code: string | null;
  macro_name: string | null;
  state: string;
  population: number | null;
  population_residente: number | null;
  population_ans: number | null;
  existing_qty: number | null;
  available_qty: number | null;
  coverage_percentage: number | null;
  deficit_status: MacroCoverageApi['deficit_status'];
}

export interface NivelCoberturaParams {
  equipmentFamily: string;
  states?: string[];
  macroCodes?: string[];
  healthRegionCodes?: string[];
  municipalities?: string[];
  /** so pra /municipality-coverage -- municipio abaixo disso nao aparece
   * (RN especifica de TOMOGRAFO: municipio pequeno nao era esperado ter
   * equipamento proprio). Omitir pra nao aplicar o corte (ex.: quando o
   * proprio usuario ja escolheu um municipio/CNES especifico). */
  minPopulation?: number;
}

/**
 * Cobertura por Municipio -- linha da tabela "Cobertura Assistencial" quando
 * o filtro escolhido afunila ate Municipio ou CNES (decisao 2026-08-21).
 */
export async function fetchMunicipalityCoverage(params: NivelCoberturaParams): Promise<NivelCoberturaRow[]> {
  const query: Record<string, string | string[]> = { equipment_family: params.equipmentFamily };
  if (params.states?.length) query.state = params.states;
  if (params.macroCodes?.length) query.macro_code = params.macroCodes;
  if (params.healthRegionCodes?.length) query.health_region_code = params.healthRegionCodes;
  if (params.municipalities?.length) query.municipality = params.municipalities;
  if (params.minPopulation != null) query.min_population = String(params.minPopulation);

  const rows = await apiGet<MunicipalityCoverageApi[]>('/municipality-coverage', query);
  return rows.map((r) => ({
    chave: r.ibge_code,
    nome: r.municipality_name,
    uf: r.state,
    regiaoSaudeNome: r.health_region_name,
    regiaoSaudeId: r.health_region_code,
    macroNome: r.macro_name,
    macroId: r.macro_code,
    pop: r.population ?? 0,
    popResidente: r.population_residente ?? 0,
    popAns: r.population_ans ?? 0,
    oferta: r.available_qty ?? 0,
    ofertaTotal: r.existing_qty ?? 0,
    cobertura: r.coverage_percentage ?? 0,
    status: toStatus(r.deficit_status),
    distanciaKmEquipamentoMaisProximo: r.distance_km_nearest_equipment,
    latitude: r.latitude,
    longitude: r.longitude,
    ibgeCode7: r.ibge_code_7,
  }));
}

/**
 * Cobertura por Regiao de Saude -- linha da tabela "Cobertura Assistencial"
 * quando o filtro escolhido e Regiao de Saude, sem afunilar ate
 * Municipio/CNES (decisao 2026-08-21). Agregado em tempo de leitura no
 * backend a partir de municipality_coverage -- por isso nao aceita
 * min_population (nao faz sentido nesse nivel, ver comentario no router).
 */
export async function fetchHealthRegionCoverage(
  params: Omit<NivelCoberturaParams, 'municipalities' | 'minPopulation'>,
): Promise<NivelCoberturaRow[]> {
  const query: Record<string, string | string[]> = { equipment_family: params.equipmentFamily };
  if (params.states?.length) query.state = params.states;
  if (params.macroCodes?.length) query.macro_code = params.macroCodes;

  const rows = await apiGet<HealthRegionCoverageApi[]>('/health-region-coverage', query);
  return rows.map((r) => ({
    chave: r.health_region_code,
    nome: r.health_region_name,
    uf: r.state,
    macroNome: r.macro_name,
    macroId: r.macro_code,
    pop: r.population ?? 0,
    popResidente: r.population_residente ?? 0,
    popAns: r.population_ans ?? 0,
    oferta: r.available_qty ?? 0,
    ofertaTotal: r.existing_qty ?? 0,
    cobertura: r.coverage_percentage ?? 0,
    status: toStatus(r.deficit_status),
  }));
}
