/** `siconv`/`transferegov` (payload cru, usado só na camada 2 "Mais
 * detalhes") vêm nulos na listagem (`fetchConvenios`) -- carregados sob
 * demanda por `fetchConvenioDetalhe` quando o card expande (ver
 * `useConvenioDetalhe`), evita puxar ~11MB de payload pra renderizar uma
 * lista que só mostra resumo. */
import { z } from 'zod';
import { requisitar } from '@/lib/http-client';
import type { ConvenioUnificado } from '@/types/monitoramento';
function apiGet<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  return requisitar(path, schema, undefined);
}

const equipamentoMarcadorApiSchema = z.object({
  codigo: z.string(),
  nome: z.string(),
  prioritario: z.boolean(),
  descricao_original: z.string(),
  tipo_evidencia: z.string(),
  relacao: z.string(),
  confianca: z.number(),
});

const convenioApiSchema = z.object({
  numero: z.string(),
  numero_instrumento: z.string().nullable(),
  ano_instrumento: z.number().nullable(),
  objeto: z.string().nullable(),
  situacao: z.string().nullable(),
  situacao_portal: z.string().nullable(),
  situacao_contratacao: z.string().nullable(),
  convenente_nome: z.string(),
  convenente_cnpj: z.string().nullable(),
  convenente_tipo: z.string().nullable(),
  tipo_contratacao: z.string().nullable(),
  tipologia: z.string().nullable(),
  municipio: z.string().nullable(),
  uf: z.string().nullable(),
  codigo_ibge: z.string().nullable(),
  regiao: z.string().nullable(),
  orgao: z.string().nullable(),
  unidade_gestora: z.string().nullable(),
  subfuncao: z.string().nullable(),
  funcao: z.string().nullable(),
  tipo_instrumento: z.string().nullable(),
  numero_processo: z.string().nullable(),
  programa: z.string().nullable(),
  data_publicacao: z.string().nullable(),
  data_inicio_vigencia: z.string().nullable(),
  data_final_vigencia: z.string().nullable(),
  data_conclusao: z.string().nullable(),
  data_ultima_liberacao: z.string().nullable(),
  valor_global: z.number().nullable(),
  valor_repasse: z.number().nullable(),
  valor_empenhado: z.number().nullable(),
  valor_desembolsado: z.number().nullable(),
  valor_contrapartida: z.number().nullable(),
  valor_saldo_conta: z.number().nullable(),
  valor_ultima_liberacao: z.number().nullable(),
  valor_pago_fornecedor: z.number().nullable(),
  pagamentos_count: z.number(),
  financeiro_fonte_confiavel: z.boolean(),
  dados_oficiais_disponiveis: z.boolean(),
  desembolso_integral_da_carga: z.boolean(),
  equipamentos: z.array(equipamentoMarcadorApiSchema),
  cnes: z.string().nullable(),
  cnes_nome_estabelecimento: z.string().nullable(),
});

const convenioDetalheApiSchema = convenioApiSchema.extend({
  siconv_raw: z.record(z.string(), z.unknown()).nullable(),
  transferegov_raw: z.record(z.string(), z.unknown()).nullable(),
});

const convenioListaApiSchema = z.object({
  total: z.number(),
  itens: z.array(convenioApiSchema),
});

type ConvenioApi = z.infer<typeof convenioApiSchema>;

/** Mapeia o formato snake_case da API pro mesmo `ConvenioUnificado` que
 * `mesclarConvenios.ts` produzia -- `siconv`/`transferegov` chegam `null`
 * aqui (ver `toConvenioUnificadoDetalhe` pra quando eles vêm preenchidos,
 * usado só na camada 2). Nenhum consumidor (convenio-card*.tsx) precisou
 * mudar por causa dessa troca de fonte. */
function toConvenioUnificado(c: ConvenioApi): ConvenioUnificado {
  return {
    numero: c.numero,
    numeroInstrumento: c.numero_instrumento,
    objeto: c.objeto ?? '',
    situacao: c.situacao ?? '',
    situacaoPortal: c.situacao_portal ?? '',
    situacaoContratacao: c.situacao_contratacao,
    tipoContratacao: c.tipo_contratacao,
    tipologia: c.tipologia,
    convenente: { nome: c.convenente_nome, cnpj: c.convenente_cnpj, tipo: c.convenente_tipo ?? '' },
    municipio: c.municipio ?? '',
    uf: c.uf ?? '',
    codigoIbge: c.codigo_ibge ?? '',
    regiao: c.regiao ?? '',
    orgao: c.orgao ?? '',
    unidadeGestora: c.unidade_gestora ?? '',
    subfuncao: c.subfuncao ?? '',
    funcao: c.funcao ?? '',
    tipoInstrumento: c.tipo_instrumento ?? '',
    numeroProcesso: c.numero_processo ?? '',
    cnes: c.cnes,
    cnesNomeEstabelecimento: c.cnes_nome_estabelecimento,
    programa: c.programa,
    equipamentos: c.equipamentos.map((equipamento) => ({
      codigo: equipamento.codigo,
      nome: equipamento.nome,
      prioritario: equipamento.prioritario,
      descricaoOriginal: equipamento.descricao_original,
      tipoEvidencia: equipamento.tipo_evidencia,
      relacao: equipamento.relacao,
      confianca: equipamento.confianca,
    })),
    dadosOficiaisDisponiveis: c.dados_oficiais_disponiveis,
    desembolsoIntegralDaCarga: c.desembolso_integral_da_carga,
    valorPagoFornecedor: c.valor_pago_fornecedor,
    pagamentosCount: c.pagamentos_count,
    datas: {
      publicacao: c.data_publicacao,
      inicioVigencia: c.data_inicio_vigencia,
      fimVigencia: c.data_final_vigencia,
      conclusao: c.data_conclusao,
      ultimaLiberacao: c.data_ultima_liberacao,
    },
    financeiro: {
      global: c.valor_global,
      repasse: c.valor_repasse,
      empenhado: c.valor_empenhado,
      desembolsado: c.valor_desembolsado,
      contrapartida: c.valor_contrapartida,
      saldoConta: c.valor_saldo_conta,
      ultimaLiberacaoValor: c.valor_ultima_liberacao,
      fonteConfiavel: c.financeiro_fonte_confiavel,
    },
    siconv: null,
    transferegov: null,
  };
}

export interface FiltroConvenios {
  busca?: string;
  uf?: string;
  equipamento?: string;
  situacao?: string;
  ano?: number;
  programa?: string;
  pagina?: number;
  tamanhoPagina?: number;
}

export interface ConvenioListaResultado {
  total: number;
  itens: ConvenioUnificado[];
}

export async function fetchConvenios(filtro: FiltroConvenios): Promise<ConvenioListaResultado> {
  const params = new URLSearchParams();
  if (filtro.busca) params.set('busca', filtro.busca);
  if (filtro.uf) params.set('uf', filtro.uf);
  if (filtro.equipamento) params.set('equipamento', filtro.equipamento);
  if (filtro.situacao) params.set('situacao', filtro.situacao);
  if (filtro.ano) params.set('ano', String(filtro.ano));
  if (filtro.programa) params.set('programa', filtro.programa);
  params.set('pagina', String(filtro.pagina ?? 1));
  params.set('tamanho_pagina', String(filtro.tamanhoPagina ?? 20));

  const resultado = await apiGet(`/convenios?${params}`, convenioListaApiSchema);
  return { total: resultado.total, itens: resultado.itens.map(toConvenioUnificado) };
}

/** `siconv`/`transferegov` cru pro card expandido (camada 2) -- chamado só
 * quando o usuário clica "Mais detalhes" (ver `useConvenioDetalhe`), nunca
 * na listagem inteira. O shape de `siconv_raw`/`transferegov_raw` no banco
 * é o objeto `SiconvEntrada`/`TransfereGovEnte` inteiro, sem reformatação
 * (mesmo runtime shape que o JSON estático tinha) -- só troca de onde o
 * dado vem. */
export async function fetchConvenioDetalhe(numero: string): Promise<ConvenioUnificado> {
  const c = await apiGet(`/convenios/${encodeURIComponent(numero)}`, convenioDetalheApiSchema);
  return {
    ...toConvenioUnificado(c),
    siconv: c.dados_oficiais_disponiveis ? (c.siconv_raw as ConvenioUnificado['siconv']) ?? null : null,
    transferegov: c.dados_oficiais_disponiveis ? (c.transferegov_raw as ConvenioUnificado['transferegov']) ?? null : null,
  };
}
