import { z } from 'zod';
import { ApiError } from '@/lib/api-error';
import { csrfHeaders } from '@/lib/csrf';

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

/** Sessão via cookie HttpOnly (Plan Mode segurança 2026-09-16, Bloco 2) --
 * não há mais token em `localStorage` pra ler/guardar: o browser manda o
 * cookie sozinho em toda chamada com `credentials: 'include'`, e o backend
 * o seta em `/auth/login`/`/auth/refresh`. JS não tem (nem precisa ter)
 * acesso ao valor -- é exatamente o ponto de HttpOnly (elimina o vetor de
 * XSS que um token em localStorage tinha). "Está logado?" deixa de ser uma
 * leitura síncrona local e passa a ser sempre uma pergunta ao backend (ver
 * `useAuthSession`, que resolve isso via `GET /auth/me`). */

async function mensagemErroHttp(resp: Response): Promise<string> {
  try {
    const body = (await resp.json()) as { detail?: string; error?: string };
    return body.detail ?? body.error ?? `HTTP ${resp.status}`;
  } catch {
    return `HTTP ${resp.status}`;
  }
}

/** Dedup de refresh concorrente -- se várias chamadas em paralelo levam
 * 401 ao mesmo tempo (ex. página que dispara 3 queries juntas), só a
 * primeira dispara `POST /auth/refresh`; as demais aguardam essa mesma
 * promise em vez de cada uma rotacionar o refresh token por conta própria
 * (rotação real invalida o anterior -- disparar 2 em paralelo faria a
 * segunda falhar por reuso do token já rotacionado pela primeira). */
let renovacaoEmAndamento: Promise<boolean> | null = null;

function tentarRenovarSessao(): Promise<boolean> {
  if (!renovacaoEmAndamento) {
    renovacaoEmAndamento = fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: csrfHeaders(),
    })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        renovacaoEmAndamento = null;
      });
  }
  return renovacaoEmAndamento;
}

/** Núcleo comum a GET/POST/PATCH: monta a URL, chama `fetch` sempre com
 * `credentials: 'include'` (manda/recebe o cookie de sessão), valida
 * status e schema, lança `ApiError` (nunca erro cru) em qualquer falha.
 *
 * 401 tenta renovar a sessão uma vez via `/auth/refresh` (Bloco 2) e repete
 * a chamada original antes de desistir. Só redireciona pra /login depois
 * disso quando `redirecionarEm401` for true (default) -- `fetchCurrentUser`
 * (`GET /auth/me`) passa `false`: essa chamada roda em toda página
 * (inclusive públicas, ex. header) só pra saber "está logado?", e 401 ali
 * é um estado normal de visitante anônimo, não uma sessão que expirou no
 * meio de uma tela protegida (esse caso É redirecionado, ver leituras de
 * monitoramento/propostas-candidatas do Bloco 1). `/auth/login`,
 * `/auth/refresh` e `/auth/logout` nunca disparam a renovação (evita loop
 * óbvio). Redirect também fica de fora quando já se está em /login. */
async function requisitar<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit | undefined,
  redirecionarEm401 = true,
): Promise<T> {
  const metodo = (init?.method ?? 'GET').toUpperCase();
  const precisaCsrf = metodo !== 'GET' && path !== '/auth/login';
  const executar = () =>
    fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: { ...init?.headers, ...(precisaCsrf ? csrfHeaders() : {}) },
    });

  let res: Response;
  try {
    res = await executar();
  } catch (e) {
    throw new ApiError(`Falha de rede ao consultar ${path}: ${(e as Error).message}`);
  }

  const podeRenovar = path !== '/auth/login' && path !== '/auth/refresh' && path !== '/auth/logout';
  if (res.status === 401 && podeRenovar) {
    const renovou = await tentarRenovarSessao();
    if (renovou) {
      try {
        res = await executar();
      } catch (e) {
        throw new ApiError(`Falha de rede ao consultar ${path}: ${(e as Error).message}`);
      }
    }
  }
  if (res.status === 401 && redirecionarEm401) {
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.assign('/login');
    }
  }
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

/** Alias documental de `apiGet` -- usado pelas leituras de monitoramento/
 * propostas-candidatas que passaram a exigir sessão (Bloco 1). Mecanicamente
 * igual a `apiGet` desde o Bloco 2 (o cookie já vai em toda chamada,
 * autenticada ou não); mantido como nome próprio só pra marcar no código
 * quem depende de sessão vs. quem é público por decisão (ex. `fetchMarcos`). */
function apiGetAuthed<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  return requisitar(path, schema, undefined);
}

function apiAuthed<T>(path: string, schema: z.ZodType<T>, method: 'POST' | 'PATCH', body?: unknown): Promise<T> {
  return requisitar(path, schema, {
    method,
    headers: { 'Content-Type': 'application/json' },
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

const statusResponseSchema = z.object({ status: z.string() });

/** POST /auth/login -- o backend seta os cookies de sessão (access +
 * refresh + csrf) na própria resposta (Bloco 2); nada pra guardar em
 * `localStorage` aqui. O bearer fallback e o `access_token` no corpo
 * foram removidos em 2026-09-17 (Bloco 2 do Plan Mode consolidação). */
export async function login(email: string, password: string): Promise<void> {
  await requisitar('/auth/login', statusResponseSchema, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

/** POST /auth/logout -- revoga a sessão no servidor (Bloco 2), diferente
 * do comportamento antigo (só limpava o token no cliente, JWT continuava
 * válido até expirar). */
export async function logout(): Promise<void> {
  await requisitar('/auth/logout', statusResponseSchema, { method: 'POST' });
}

export function fetchCurrentUser(): Promise<AuthUser> {
  // redirecionarEm401=false -- roda em toda página (inclusive públicas, ver
  // header) só pra checar sessão; 401 aqui é "visitante anônimo", estado
  // normal, não motivo pra redirect global (ver docstring de `requisitar`).
  return requisitar('/auth/me', authUserSchema, undefined, false);
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
  // Situação da prestação de contas no SICONV legado -- sincronizada pelo
  // job_verificacao_siconv.py (só tipo_contratacao="Convênio"), achado
  // 2026-09-15, pedido do usuário: "dá pra gente monitorar os concluídos
  // da mesma forma que monitoramos no legado?". Diferente de `situacao`
  // (Portal da Transparência, buscada ao vivo, não é campo salvo).
  situacao_prestacao_contas: z.string().nullable(),
  // Situação da parceria/ordem de pagamento no TransfereGov Novo --
  // sincronizada por job_verificacao_transferegov.py, achado 2026-09-15,
  // pedido do usuário: "monitoramento de situação dos itens do transfere
  // novo". Só existe pra tipo_contratacao="Parceria TransfereGov". Sem
  // estado "Concluída" nesta API (testado ao vivo) -- situacao_parceria
  // pode ficar "Aprovada" mesmo com a ordem de pagamento já "Paga",
  // por isso são 2 campos separados, não 1.
  situacao_parceria_transferegov: z.string().nullable(),
  situacao_ordem_pagamento_transferegov: z.string().nullable(),
  // Só vem preenchido em GET /monitoramento/instrumentos (lista) -- ver
  // docstring do backend. Ausente/null nos outros endpoints.
  fase_atual: z.string().nullable().optional(),
});
export type InstrumentoEquipamento = z.infer<typeof instrumentoEquipamentoSchema>;

export function fetchInstrumentos(): Promise<InstrumentoEquipamento[]> {
  return apiGetAuthed('/monitoramento/instrumentos', z.array(instrumentoEquipamentoSchema));
}

/** POST /monitoramento/instrumentos -- 2 portas de entrada (ver docstring
 * do backend): candidato de proposta aceito (já feito por
 * revisarPropostaCandidata) e esta, cadastro manual/"adicionar ao
 * monitoramento" a partir de um convênio já conhecido (Instrumentos
 * firmados) ou de FAF/TED/PERSUS avulso. */
export interface CriarInstrumentoInput {
  nr_convenio: string;
  cnpj_convenente: string;
  nome_convenente: string;
  tipo_contratacao: string;
  municipio?: string | null;
  uf?: string | null;
  programa?: string | null;
  componente?: string | null;
  ano_instrumento?: number | null;
  tecnico_titular?: string | null;
  tecnico_suplente?: string | null;
}

export function criarInstrumento(corpo: CriarInstrumentoInput): Promise<InstrumentoEquipamento> {
  return apiAuthed('/monitoramento/instrumentos', instrumentoEquipamentoSchema, 'POST', corpo);
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
 * lançando `ApiError`, igual ao resto da camada de services. Rota exige
 * sessão desde o Bloco 1 -- usa `requisitar` (cookie via
 * `credentials: 'include'`, ver Bloco 2), não mais `fetch` cru. */
export async function fetchInstrumentoTimeline(nrConvenio: string): Promise<InstrumentoTimeline | null> {
  try {
    return await requisitar(`/monitoramento/instrumentos/${nrConvenio}`, instrumentoTimelineSchema, undefined);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export interface CadastroInstrumentoInput {
  tecnico_titular?: string | null;
  tecnico_suplente?: string | null;
  nivel_monitoramento?: string | null;
  finalidade?: string | null;
  modalidade_onco?: string | null;
  responsavel_execucao_nome?: string | null;
  responsavel_execucao_contato?: string | null;
  cnes?: string | null;
}

export function patchCadastroInstrumento(nrConvenio: string, corpo: CadastroInstrumentoInput): Promise<InstrumentoEquipamento> {
  return apiAuthed(`/monitoramento/instrumentos/${nrConvenio}`, instrumentoEquipamentoSchema, 'PATCH', corpo);
}

// ---------------------------------------------------------------------
// CNES -- achado 2026-09-16, pedido do usuário: "vamos deixar o campo
// cnes editável no sistema... só poderá editar por outro cnes válido na
// base de dados". `buscarCnesReferencia` alimenta um seletor (não texto
// livre) tanto no cadastro do instrumento quanto no card da proposta.
// ---------------------------------------------------------------------

const cnesReferenciaSchema = z.object({
  cnes: z.string(),
  nome_estabelecimento: z.string(),
  municipio: z.string().nullable(),
  uf: z.string().nullable(),
});
export type CnesReferencia = z.infer<typeof cnesReferenciaSchema>;

export function buscarCnesReferencia(q: string): Promise<CnesReferencia[]> {
  if (q.trim().length < 2) return Promise.resolve([]);
  return apiGetAuthed(`/monitoramento/cnes-referencia?q=${encodeURIComponent(q)}`, z.array(cnesReferenciaSchema));
}

export function patchCnesProposta(propostaId: number, cnes: string | null): Promise<PropostaCandidata> {
  return apiAuthed(`/propostas-candidatas/${propostaId}/cnes`, propostaCandidataSchema, 'PATCH', { cnes });
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
  return apiGetAuthed(`/monitoramento/acoes${query}`, z.array(acaoMonitoramentoSchema));
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
  return apiGetAuthed('/monitoramento/resumo', resumoMonitoramentoSchema);
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
  return requisitar(`/notificacoes${query}`, notificacoesListSchema, undefined);
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
  cnes: z.string().nullable(),
  cnes_nome_estabelecimento: z.string().nullable(),
  tem_parceria: z.boolean(),
  cd_parceria: z.string().nullable(),
  status: propostaCandidataStatusSchema,
  revisado_por: z.number().nullable(),
  revisado_em: z.string().nullable(),
  created_at: z.string(),
});
export type PropostaCandidata = z.infer<typeof propostaCandidataSchema>;

const propostaCandidataListaSchema = z.object({
  total: z.number(),
  itens: z.array(propostaCandidataSchema),
});

export interface FetchPropostasCandidatasOpts {
  status?: PropostaCandidataStatus;
  uf?: string;
  busca?: string;
  ano?: number;
  idPrograma?: number;
  pagina?: number;
  /** Default 500 -- mesmo padrão transitório de `fetchConvenios`: filtros
   * derivados de `metas_resumo` (equipamento / situação de fato / "novas")
   * ainda rodam no cliente, então a página pede o universo de uma vez. */
  tamanhoPagina?: number;
}

export function fetchPropostasCandidatas(
  opts: FetchPropostasCandidatasOpts | PropostaCandidataStatus = {},
): Promise<{ total: number; itens: PropostaCandidata[] }> {
  // Compat: chamada antiga `fetchPropostasCandidatas('pendente')`.
  const params = typeof opts === 'string' ? { status: opts } : opts;
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.uf) qs.set('uf', params.uf);
  if (params.busca) qs.set('busca', params.busca);
  if (params.ano != null) qs.set('ano', String(params.ano));
  if (params.idPrograma != null) qs.set('id_programa', String(params.idPrograma));
  qs.set('pagina', String(params.pagina ?? 1));
  qs.set('tamanho_pagina', String(params.tamanhoPagina ?? 500));
  const query = qs.toString() ? `?${qs}` : '';
  return apiGetAuthed(`/propostas-candidatas${query}`, propostaCandidataListaSchema);
}

export function revisarPropostaCandidata(
  propostaId: number,
  decisao: 'aceita' | 'rejeitada',
): Promise<PropostaCandidata> {
  return apiAuthed(`/propostas-candidatas/${propostaId}/revisar`, propostaCandidataSchema, 'POST', { decisao });
}
