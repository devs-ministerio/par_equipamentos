import { z } from 'zod';
import { API_BASE_URL, requisitar } from '@/lib/http-client';
import { UF_INFO } from '../data/geo-reference';
import type {
  CoberturaRow,
  EstabelecimentoRow,
  Macrorregiao,
  NivelCoberturaRow,
  StatusCobertura,
  TipoEquipamento,
} from '../types/domain';

/** Cada schema faz `.transform()` snake_case (wire) → camelCase (domínio)
 * num passo só, então `z.infer` do schema já é o tipo de domínio -- nunca
 * duplicar como interface manual. `apiGet` só monta a query string por
 * objeto e delega transporte/erro pra `lib/http-client.ts`. */

async function apiGet<T>(path: string, schema: z.ZodType<T>, params?: Record<string, string | string[]>): Promise<T> {
  const url = new URL(path, API_BASE_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, item));
      else url.searchParams.set(k, v);
    }
  }
  return requisitar(url.pathname + url.search, schema);
}

function toStatus(deficitStatus: 'deficient' | 'not_deficient' | 'not_available'): StatusCobertura {
  if (deficitStatus === 'not_deficient') return 'Hiperssuficiente';
  if (deficitStatus === 'deficient') return 'Hipossuficiente';
  return 'Dados indisponíveis';
}

const deficitStatusSchema = z.enum(['deficient', 'not_deficient', 'not_available']);

// ---- GET /macro-coverage (backend/app/schemas.py::MacroCoverageRead) ----
const macroCoverageApiSchema = z.object({
  id: z.number(),
  execution_id: z.number(),
  macro_code: z.string(),
  macro_name: z.string(),
  state: z.string(),
  equipment_family: z.string(),
  population: z.number().nullable(),
  population_residente: z.number().nullable(),
  population_ans: z.number().nullable(),
  estimated_need: z.number().nullable(),
  required_qty: z.number().nullable(),
  available_qty: z.number().nullable(),
  existing_qty: z.number().nullable(),
  facility_count: z.number().nullable(),
  balance: z.number().nullable(),
  deficit_status: deficitStatusSchema,
  coverage_percentage: z.number().nullable(),
});

const macroCoverageListSchema = z.array(macroCoverageApiSchema);

export interface MacroCoverageResult {
  macros: Macrorregiao[];
  coberturaRows: CoberturaRow[];
}

export async function fetchMacroCoverage(equipmentFamily: string, macroCodes?: string[]): Promise<MacroCoverageResult> {
  const query: Record<string, string | string[]> = { equipment_family: equipmentFamily };
  if (macroCodes?.length) query.macro_code = macroCodes;
  const rows = await apiGet('/macro-coverage', macroCoverageListSchema, query);

  const macros = rows.map((r) => {
    const geo = UF_INFO[r.state];
    return {
      id: r.macro_code,
      nome: r.macro_name,
      uf: r.state,
      regiao: geo?.regiao ?? ('Norte' as const),
      pop: r.population ?? 0,
      popResidente: r.population_residente ?? 0,
      popAns: r.population_ans ?? 0,
      nomeEstado: geo?.nome ?? r.state,
    };
  });

  const coberturaRows = rows.map((r) => ({
    macroId: r.macro_code,
    oferta: r.available_qty ?? 0,
    ofertaTotal: r.existing_qty ?? 0,
    demanda: r.required_qty ?? 0,
    cobertura: r.coverage_percentage ?? 0,
    status: toStatus(r.deficit_status),
  }));

  return { macros, coberturaRows };
}

// ---- GET /equipment-offer-rows/establishments (backend/app/schemas.py::EstablishmentRead) ----
const tipoEquipamentoSchema: z.ZodType<TipoEquipamento> = z.object({
  tipo: z.string(),
  qtd: z.number(),
});

const establishmentApiSchema = z.object({
  cnes_code: z.string(),
  facility_name: z.string().nullable(),
  municipality_name: z.string().nullable(),
  macro_code: z.string().nullable(),
  macro_name: z.string().nullable(),
  health_region_code: z.string().nullable(),
  health_region_name: z.string().nullable(),
  state: z.string(),
  existing_qty: z.number(),
  in_use_qty: z.number(),
  sus_flag: z.boolean(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  types: z.array(tipoEquipamentoSchema),
});

const establishmentPageApiSchema = z.object({
  items: z.array(establishmentApiSchema),
  total: z.number(),
});

function toEstabelecimentoRow(r: z.infer<typeof establishmentApiSchema>): EstabelecimentoRow {
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
  /** Só equipamento SUS efetivamente em uso — exigido por distância e
   * "mais próximo"; não se aplica às listagens cadastrais. */
  inUseSusOnly?: boolean;
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
  if (params.inUseSusOnly) query.in_use_sus = 'true';

  const page = await apiGet('/equipment-offer-rows/establishments', establishmentPageApiSchema, query);
  return { items: page.items.map(toEstabelecimentoRow), total: page.total };
}

// ---- GET /equipment-offer-rows/totals ----
export interface TotaisParams {
  equipmentFamily: string;
  states?: string[];
  macroCodes?: string[];
  healthRegionCodes?: string[];
  municipalities?: string[];
  cnesCodes?: string[];
}

const equipmentTotalsApiSchema = z.object({
  existing_qty: z.number(),
  available_qty: z.number(),
});

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
  const r = await apiGet('/equipment-offer-rows/totals', equipmentTotalsApiSchema, query);
  return { existingQty: r.existing_qty, availableQty: r.available_qty };
}

// ---- GET /equipment-offer-rows/by-legal-nature ----
const legalNatureApiSchema = z.object({
  legal_nature: z.string(),
  existing_qty: z.number(),
  available_qty: z.number(),
});

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
  const rows = await apiGet('/equipment-offer-rows/by-legal-nature', z.array(legalNatureApiSchema), {
    equipment_family: equipmentFamily,
  });
  return rows.map((r) => ({ naturezaJuridica: r.legal_nature, existingQty: r.existing_qty, availableQty: r.available_qty }));
}

// ---- GET /equipment-offer-rows/facilities (backend/app/schemas.py::FacilityOptionRead) ----
const facilityOptionApiSchema = z.object({
  cnes_code: z.string(),
  facility_name: z.string().nullable(),
  state: z.string(),
  macro_code: z.string().nullable(),
  macro_name: z.string().nullable(),
  health_region_code: z.string().nullable(),
  health_region_name: z.string().nullable(),
  municipality_name: z.string().nullable(),
});

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
  const rows = await apiGet('/equipment-offer-rows/facilities', z.array(facilityOptionApiSchema), {
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

// ---- GET /municipality-coverage (backend/app/schemas.py::MunicipalityCoverageRead) ----
const municipalityCoverageApiSchema = z.object({
  ibge_code: z.string(),
  municipality_name: z.string(),
  health_region_code: z.string().nullable(),
  health_region_name: z.string().nullable(),
  macro_code: z.string().nullable(),
  macro_name: z.string().nullable(),
  state: z.string(),
  population: z.number().nullable(),
  population_residente: z.number().nullable(),
  population_ans: z.number().nullable(),
  existing_qty: z.number().nullable(),
  available_qty: z.number().nullable(),
  coverage_percentage: z.number().nullable(),
  deficit_status: deficitStatusSchema,
  // So informativo -- nao entra em deficit_status. Nulo pra familias cujo
  // pipeline ainda nao calcula (so TOMOGRAFO por enquanto, ver
  // backend/app/pipeline/geo.py).
  distance_km_nearest_equipment: z.number().nullable(),
  // Coordenada da sede do municipio -- ver comentario em
  // backend/app/schemas.py::MunicipalityCoverageRead.
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  // Codigo IBGE de 7 digitos -- ver mesmo comentario.
  ibge_code_7: z.string().nullable(),
});

// ---- GET /health-region-coverage (backend/app/schemas.py::HealthRegionCoverageRead) ----
const healthRegionCoverageApiSchema = z.object({
  health_region_code: z.string(),
  health_region_name: z.string(),
  macro_code: z.string().nullable(),
  macro_name: z.string().nullable(),
  state: z.string(),
  population: z.number().nullable(),
  population_residente: z.number().nullable(),
  population_ans: z.number().nullable(),
  existing_qty: z.number().nullable(),
  available_qty: z.number().nullable(),
  coverage_percentage: z.number().nullable(),
  deficit_status: deficitStatusSchema,
});

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

  const rows = await apiGet('/municipality-coverage', z.array(municipalityCoverageApiSchema), query);
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

  const rows = await apiGet('/health-region-coverage', z.array(healthRegionCoverageApiSchema), query);
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
