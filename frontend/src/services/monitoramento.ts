import { z } from 'zod';
import { ApiError } from '@/lib/api-error';

/** Base da API do backend (nao dos JSON estaticos de public/, ver
 * useJson.ts) -- so o monitoramento interno pos-repasse fala com isso, e a
 * lista leve de instrumentos monitorados usada na pagina principal pra
 * destacar o card certo sem abrir um por um.
 *
 * Migrado pro padrão Zod+ApiError da camada de services (ver src/services/
 * api.ts, referência já aplicada nesta sessão) -- cada endpoint tem um
 * `z.object({...})` espelhando o formato exato da resposta (snake_case,
 * igual o backend devolve) e `apiFetch` valida com `.safeParse` antes de
 * devolver pra UI, lançando `ApiError` em qualquer falha (rede, HTTP,
 * schema). Ao contrário de `services/api.ts`, aqui o formato de domínio
 * continua snake_case (não vira camelCase) -- decisão deliberada: os ~4
 * forms/telas que consomem esses tipos (MonitoramentoInterno e páginas de
 * overview/painel) já usavam esse formato extensamente, e "não mudar
 * comportamento observável" pesou mais que a convenção de nomenclatura
 * (ver AGENTS/CLAUDE.md do escopo desta tarefa). */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

const AUTH_TOKEN_STORAGE_KEY = 'sigeo.authToken';

export function getAuthToken(): string | null {
  return typeof window === 'undefined' ? null : window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

export function setAuthToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  else window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

function authHeaders(): HeadersInit {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function mensagemErroHttp(resp: Response): Promise<string> {
  try {
    const body = (await resp.json()) as { detail?: string; error?: string };
    return body.detail ?? body.error ?? `HTTP ${resp.status}`;
  } catch {
    return `HTTP ${resp.status}`;
  }
}

/** Núcleo comum a GET/POST/PATCH: monta a URL, chama `fetch`, valida
 * status e schema, lança `ApiError` (nunca erro cru) em qualquer falha.
 * `onUnauthorized` limpa o token quando o backend devolve 401 -- mesmo
 * comportamento do antigo `assertRespostaOk`. */
async function requisitar<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit | undefined,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, init);
  } catch (e) {
    throw new ApiError(`Falha de rede ao consultar ${path}: ${(e as Error).message}`);
  }
  if (res.status === 401) setAuthToken(null);
  if (!res.ok) {
    throw new ApiError(await mensagemErroHttp(res), res.status);
  }
  const json = res.status === 204 ? null : await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError(`Resposta de ${path} não bate com o schema esperado: ${parsed.error.message}`);
  }
  return parsed.data;
}

function apiGet<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  return requisitar(path, schema, undefined);
}

function apiAuthed<T>(path: string, schema: z.ZodType<T>, method: 'POST' | 'PATCH', body?: unknown): Promise<T> {
  return requisitar(path, schema, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------
// Auth (backend/app/routers/auth.py)
// ---------------------------------------------------------------------

const authUserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  role: z.enum(['admin', 'colaborador', 'leitor']),
  status: z.enum(['active', 'inactive', 'suspended']),
  created_at: z.string(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

const tokenResponseSchema = z.object({ access_token: z.string() });

export async function login(email: string, password: string): Promise<string> {
  const { access_token } = await requisitar('/auth/login', tokenResponseSchema, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  setAuthToken(access_token);
  return access_token;
}

export function fetchCurrentUser(): Promise<AuthUser> {
  return requisitar('/auth/me', authUserSchema, { headers: authHeaders() });
}

// ---------------------------------------------------------------------
// Monitoramento -- catálogo de marcos (backend/app/routers/monitoramento.py)
// ---------------------------------------------------------------------

const marcoGrupoSchema = z.enum(['fase_geral', 'cronograma_fisico', 'regulatorio']);

const marcoCatalogoSchema = z.object({
  id: z.number(),
  codigo: z.string(),
  grupo: marcoGrupoSchema,
  ordem: z.number().nullable(),
  execucao_fisica_pct_referencia: z.number().nullable(),
  rotulo: z.string(),
  descricao_referencia: z.string().nullable(),
});
export type MarcoCatalogo = z.infer<typeof marcoCatalogoSchema>;

export function fetchMarcos(): Promise<MarcoCatalogo[]> {
  return apiGet('/monitoramento/marcos', z.array(marcoCatalogoSchema));
}

// ---------------------------------------------------------------------
// Monitoramento -- instrumentos
// ---------------------------------------------------------------------

const eventoMarcoSchema = z.object({
  id: z.number(),
  marco_id: z.number(),
  data_ocorrencia: z.string().nullable(),
  data_prevista: z.string().nullable(),
  status_regulatorio: z.string().nullable(),
  numero_documento: z.string().nullable(),
  data_validade: z.string().nullable(),
  observacao: z.string().nullable(),
  autor_nome: z.string().nullable().optional(),
  created_at: z.string(),
});
export type EventoMarco = z.infer<typeof eventoMarcoSchema>;

const instrumentoEquipamentoSchema = z.object({
  id: z.number(),
  nr_convenio: z.string(),
  cnpj_convenente: z.string(),
  nome_convenente: z.string(),
  municipio: z.string().nullable(),
  uf: z.string().nullable(),
  cnes: z.string().nullable(),
  equipamento_descricao: z.string().nullable(),
  equipamento_marca: z.string().nullable(),
  equipamento_modelo: z.string().nullable(),
  equipamento_numero_serie: z.string().nullable(),
  equipamento_vida_util_anos: z.number().nullable(),
  programa: z.string().nullable(),
  tp_instrumento_programa: z.string().nullable(),
  componente: z.string().nullable(),
  ano_instrumento: z.number().nullable(),
  tipo_contratacao: z.string().nullable(),
  tecnico_titular: z.string().nullable(),
  tecnico_suplente: z.string().nullable(),
  nivel_monitoramento: z.string().nullable(),
  finalidade: z.string().nullable(),
  modalidade_onco: z.string().nullable(),
  responsavel_execucao_nome: z.string().nullable(),
  responsavel_execucao_contato: z.string().nullable(),
  // Só vem preenchido em GET /monitoramento/instrumentos (lista) -- ver
  // docstring do backend. Ausente/null nos outros endpoints.
  fase_atual: z.string().nullable().optional(),
});
export type InstrumentoEquipamento = z.infer<typeof instrumentoEquipamentoSchema>;

export function fetchInstrumentos(): Promise<InstrumentoEquipamento[]> {
  return apiGet('/monitoramento/instrumentos', z.array(instrumentoEquipamentoSchema));
}

const valorSituacaoAoVivoSchema = z.object({
  disponivel: z.boolean(),
  valor: z.number().nullable().optional(),
  valor_liberado: z.number().nullable().optional(),
  situacao: z.string().nullable().optional(),
  valor_suspeito: z.boolean().optional().default(false),
});
export type ValorSituacaoAoVivo = z.infer<typeof valorSituacaoAoVivoSchema>;

const instrumentoTimelineSchema = z.object({
  instrumento: instrumentoEquipamentoSchema,
  ao_vivo: valorSituacaoAoVivoSchema,
  eventos: z.array(eventoMarcoSchema),
});
export type InstrumentoTimeline = z.infer<typeof instrumentoTimelineSchema>;

/** `null` = convênio sem instrumento seedado (404 -- caso normal pros
 * convênios ainda não monitorados). Qualquer outra falha continua
 * lançando `ApiError`, igual ao resto da camada de services. */
export async function fetchInstrumentoTimeline(nrConvenio: string): Promise<InstrumentoTimeline | null> {
  const res = await fetch(`${API_BASE_URL}/monitoramento/instrumentos/${nrConvenio}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(await mensagemErroHttp(res), res.status);
  const json = await res.json();
  const parsed = instrumentoTimelineSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError(`Resposta de /monitoramento/instrumentos/${nrConvenio} não bate com o schema esperado: ${parsed.error.message}`);
  }
  return parsed.data;
}

export interface CadastroInstrumentoInput {
  tecnico_titular?: string | null;
  tecnico_suplente?: string | null;
  nivel_monitoramento?: string | null;
  finalidade?: string | null;
  modalidade_onco?: string | null;
  responsavel_execucao_nome?: string | null;
  responsavel_execucao_contato?: string | null;
}

export function patchCadastroInstrumento(nrConvenio: string, corpo: CadastroInstrumentoInput): Promise<InstrumentoEquipamento> {
  return apiAuthed(`/monitoramento/instrumentos/${nrConvenio}`, instrumentoEquipamentoSchema, 'PATCH', corpo);
}

export interface RegistrarEventoInput {
  marco_id: number;
  data_ocorrencia?: string | null;
  status_regulatorio?: string | null;
  numero_documento?: string | null;
  data_validade?: string | null;
  observacao?: string | null;
  equipamento_marca?: string | null;
  equipamento_modelo?: string | null;
  equipamento_numero_serie?: string | null;
  equipamento_vida_util_anos?: number | null;
}

export function registrarEvento(nrConvenio: string, corpo: RegistrarEventoInput): Promise<EventoMarco> {
  return apiAuthed(`/monitoramento/instrumentos/${nrConvenio}/eventos`, eventoMarcoSchema, 'POST', corpo);
}

// ---------------------------------------------------------------------
// Monitoramento -- ações
// ---------------------------------------------------------------------

const acaoMonitoramentoSchema = z.object({
  id: z.number(),
  instrumento_id: z.number(),
  nr_convenio: z.string(),
  descricao: z.string(),
  data_prevista: z.string().nullable(),
  data_conclusao: z.string().nullable(),
  responsavel: z.string().nullable(),
  created_at: z.string(),
});
export type AcaoMonitoramento = z.infer<typeof acaoMonitoramentoSchema>;

export function fetchAcoes(pendentes?: boolean): Promise<AcaoMonitoramento[]> {
  const query = pendentes ? '?pendentes=true' : '';
  return apiGet(`/monitoramento/acoes${query}`, z.array(acaoMonitoramentoSchema));
}

export interface CriarAcaoInput {
  descricao: string;
  data_prevista?: string | null;
  responsavel?: string | null;
}

export function criarAcao(nrConvenio: string, corpo: CriarAcaoInput): Promise<AcaoMonitoramento> {
  return apiAuthed(`/monitoramento/instrumentos/${nrConvenio}/acoes`, acaoMonitoramentoSchema, 'POST', corpo);
}

export function concluirAcao(acaoId: number): Promise<AcaoMonitoramento> {
  return apiAuthed(`/monitoramento/acoes/${acaoId}/concluir`, acaoMonitoramentoSchema, 'PATCH');
}

// ---------------------------------------------------------------------
// Monitoramento -- resumo agregado (overview/painel)
// ---------------------------------------------------------------------

const contagemRotuloSchema = z.object({ rotulo: z.string(), quantidade: z.number() });
export type ContagemRotulo = z.infer<typeof contagemRotuloSchema>;

const inauguracaoResumoSchema = z.object({
  nr_convenio: z.string(),
  nome_convenente: z.string(),
  data: z.string(),
  realizada: z.boolean(),
  dias: z.number(),
});
export type InauguracaoResumo = z.infer<typeof inauguracaoResumoSchema>;

const licencaVencendoResumoSchema = z.object({
  nr_convenio: z.string(),
  nome_convenente: z.string(),
  data_validade: z.string(),
  dias: z.number(),
});
export type LicencaVencendoResumo = z.infer<typeof licencaVencendoResumoSchema>;

const resumoMonitoramentoSchema = z.object({
  total_instrumentos: z.number(),
  pct_execucao_fisica_medio: z.number().nullable(),
  distribuicao_fase: z.array(contagemRotuloSchema),
  licencas_cnen_deferidas: z.number(),
  licencas_vencendo: z.array(licencaVencendoResumoSchema),
  por_tecnico_titular: z.array(contagemRotuloSchema),
  inauguracoes: z.array(inauguracaoResumoSchema),
  acoes_pendentes: z.number(),
  acoes_atrasadas: z.number(),
  nr_convenios: z.array(z.string()),
});
export type ResumoMonitoramento = z.infer<typeof resumoMonitoramentoSchema>;

export function fetchResumoMonitoramento(): Promise<ResumoMonitoramento> {
  return apiGet('/monitoramento/resumo', resumoMonitoramentoSchema);
}

// ---------------------------------------------------------------------
// Radar de Convênios -- notificações (backend/app/routers/notificacoes.py)
// ---------------------------------------------------------------------

const notificacaoTipoSchema = z.enum(['proposta_candidata', 'atualizacao_api', 'edicao_manual']);
export type NotificacaoTipo = z.infer<typeof notificacaoTipoSchema>;

const notificacaoSchema = z.object({
  id: z.number(),
  tipo: notificacaoTipoSchema,
  titulo: z.string(),
  corpo: z.string().nullable(),
  entidade_id: z.number(),
  nivel_minimo: z.string().nullable(),
  lida: z.boolean(),
  created_at: z.string(),
});
export type Notificacao = z.infer<typeof notificacaoSchema>;

const notificacoesListSchema = z.object({
  itens: z.array(notificacaoSchema),
  total: z.number(),
  nao_lidas: z.number(),
});
export type NotificacoesList = z.infer<typeof notificacoesListSchema>;

export function fetchNotificacoes(opts?: { limit?: number; apenasNaoLidas?: boolean }): Promise<NotificacoesList> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.apenasNaoLidas) params.set('apenas_nao_lidas', 'true');
  const query = params.toString() ? `?${params.toString()}` : '';
  return requisitar(`/notificacoes${query}`, notificacoesListSchema, { headers: authHeaders() });
}

export function marcarNotificacaoLida(notificacaoId: number): Promise<Notificacao> {
  return apiAuthed(`/notificacoes/${notificacaoId}`, notificacaoSchema, 'PATCH');
}

// ---------------------------------------------------------------------
// Radar de Convênios -- propostas candidatas (backend/app/routers/propostas_candidatas.py)
// ---------------------------------------------------------------------

const propostaCandidataStatusSchema = z.enum(['pendente', 'aceita', 'rejeitada']);
export type PropostaCandidataStatus = z.infer<typeof propostaCandidataStatusSchema>;

const propostaCandidataSchema = z.object({
  id: z.number(),
  id_proposta: z.number(),
  cnpj_ente_recebedor: z.string(),
  nm_proponente: z.string(),
  municipio: z.string().nullable(),
  uf: z.string().nullable(),
  ds_objeto: z.string(),
  nm_programa: z.string(),
  id_programa: z.number(),
  componente_batido: z.string(),
  equipamento_detectado: z.string().nullable(),
  vl_global_proposta: z.number().nullable(),
  situacao_proposta: z.string().nullable(),
  data_proposta: z.string().nullable(),
  metas_resumo: z.record(z.string(), z.unknown()).nullable(),
  tem_parceria: z.boolean(),
  status: propostaCandidataStatusSchema,
  revisado_por: z.number().nullable(),
  revisado_em: z.string().nullable(),
  created_at: z.string(),
});
export type PropostaCandidata = z.infer<typeof propostaCandidataSchema>;

export function fetchPropostasCandidatas(status?: PropostaCandidataStatus): Promise<PropostaCandidata[]> {
  const query = status ? `?status=${status}` : '';
  return apiGet(`/propostas-candidatas${query}`, z.array(propostaCandidataSchema));
}

export function revisarPropostaCandidata(
  propostaId: number,
  decisao: 'aceita' | 'rejeitada',
): Promise<PropostaCandidata> {
  return apiAuthed(`/propostas-candidatas/${propostaId}/revisar`, propostaCandidataSchema, 'POST', { decisao });
}
