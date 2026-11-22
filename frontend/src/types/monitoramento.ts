/** Tipos das 3 fontes (Portal da Transparencia, SICONV legado, TransfereGov
 * novo) e do tipo mesclado que a pagina realmente renderiza -- o cruzamento
 * em si roda no backend (`scripts/importar_convenios_banco.py`, achado
 * 2026-09-16) e chega pro front já pronto via `services/convenios.ts`. */

export type SiconvEntrada = {
  convenio: Record<string, string>;
  /** Programa do convenio, resolvido de forma EXATA via
   * ID_PROPOSTA -> ID_PROGRAMA -> siconv_programa.csv (achado 2026-09-08,
   * ver docstring de coletar_siconv_legado.py) -- null quando o convenio
   * nao tem ID_PROPOSTA ou o programa nao foi encontrado no dump. Fonte
   * mais confiavel que a aproximacao por CNPJ do TransfereGov: usar esta
   * primeiro, cair pro TransfereGov so quando esta for null. */
  programa: Record<string, string> | null;
  empenhos: Record<string, string>[];
  desembolsos: Record<string, string>[];
  licitacoes: Record<string, string>[];
  termos_aditivos: Record<string, string>[];
  /** siconv_pagamento.csv -- quem recebeu (NOME_FORNECEDOR,
   * IDENTIF_FORNECEDOR ja mascarado na fonte), quanto (VL_PAGO) e quando
   * (DATA_PAG). Achado 2026-09-09 a pedido do usuario ("o valor pago ao
   * fornecedor?") -- validado: soma bate de perto com
   * financeiro.desembolsado (SIT_CONVENIO). Nao confundir com `empenhos`/
   * `desembolsos` (fluxo de repasse ao CONVENENTE) -- isso aqui e o
   * proximo elo, o convenente pagando o FORNECEDOR do equipamento. */
  pagamentos: Record<string, string>[];
  itens_plano_aplicacao: Record<string, string>[];
};

export type EtapaExpandida = {
  cd_etapa: string;
  nm_etapa: string;
  ds_etapa: string | null;
  itens: Record<string, unknown>[];
};

export type PropostaExpandida = {
  proposta: Record<string, unknown>;
  metas: {
    cd_meta: number;
    nm_meta: string;
    ds_meta: string | null;
    etapas_proposta: EtapaExpandida[];
  }[];
  cronograma_desembolso: Record<string, unknown>[];
  distribuicao_recurso: Record<string, unknown>[];
  parcerias: {
    parceria: Record<string, unknown>;
    empenhos: Record<string, unknown>[];
    documentos_habeis: Record<string, unknown>[];
  }[];
};

export type TransfereGovEnte = {
  cnpj: string;
  nome: string;
  convenios_legados_relacionados: string[];
  total_propostas_na_api: number;
  propostas_expandidas: PropostaExpandida[];
};

export type EquipamentoMarcador = {
  codigo: string;
  nome: string;
  prioritario: boolean;
  descricaoOriginal: string;
  tipoEvidencia: string;
  relacao: string;
  confianca: number;
};

/** Um convenio com as 3 fontes ja cruzadas por numero (Portal + SICONV,
 * 1:1 exato) e por CNPJ (TransfereGov, aproximacao). Campo que existe em
 * mais de uma fonte usa UM valor so (o mais confiavel), nunca os dois
 * lado a lado -- ver `resolver_cnes`/lógica de merge em
 * backend/scripts/importar_convenios_banco.py pra qual fonte venceu em
 * cada caso. */
export type ConvenioUnificado = {
  numero: string;
  numeroInstrumento: string | null;
  /** Ano estruturado da fonte; nunca inferir do formato do identificador. */
  anoInstrumento: number | null;
  objeto: string;
  /** Situação em destaque (StatusPill na camada 1) -- SICONV legado
   * (SIT_CONVENIO) quando disponível, senão cai pro Portal (achado
   * 2026-09-15, pedido do usuário: destaque precisa ser a do legado). */
  situacao: string;
  /** Situação como o Portal da Transparência devolve -- mantida à parte,
   * sem destaque, só nos detalhes (Campo "Situação (Portal da
   * Transparência)" em convenio-card-detalhes.tsx). */
  situacaoPortal: string;
  situacaoContratacao: string | null;
  // Correção 2026-09-18 (Plan Mode monitoramento-ingestao): universo de
  // "Instrumentos firmados" passou de só Convênio (SICONV/TransfereGov)
  // pra incluir FAF/TED/PERSUS I/PERSUS II/PRONON.
  tipoContratacao: string | null;
  tipologia: string | null;
  // cnpj nulo pra PERSUS/PRONON -- fonte não publica, nunca inventado.
  convenente: { nome: string; cnpj: string | null; tipo: string };
  municipio: string;
  uf: string;
  codigoIbge: string;
  regiao: string;
  orgao: string;
  unidadeGestora: string;
  subfuncao: string;
  funcao: string;
  tipoInstrumento: string;
  numeroProcesso: string;
  cnes: string | null;
  cnesNomeEstabelecimento: string | null;
  /** Município do estabelecimento (CNES): onde o equipamento fica. */
  cnesMunicipio: string | null;
  // Achado 2026-09-16 ("parar de usar json estático, coloque tudo no
  // banco"): os 4 campos abaixo eram computados no cliente a partir do
  // payload cru (`siconv`/`transferegov`) -- agora vêm pré-computados da
  // API (`GET /convenios`, ver backend/scripts/importar_convenios_banco.py),
  // já disponíveis na listagem sem precisar do payload pesado. `programa`
  // é sempre o NOME_PROGRAMA do SICONV (fallback TransfereGov removido --
  // 0/403 convênios hoje dependiam dele, conferido antes de tirar).
  programa: string | null;
  equipamentos: EquipamentoMarcador[];
  dadosOficiaisDisponiveis: boolean;
  desembolsoIntegralDaCarga: boolean;
  valorPagoFornecedor: number | null;
  pagamentosCount: number;
  datas: {
    publicacao: string | null;
    inicioVigencia: string | null;
    fimVigencia: string | null;
    conclusao: string | null;
    ultimaLiberacao: string | null;
  };
  financeiro: {
    global: number | null;
    /** VL_REPASSE_CONV -- parte de repasse federal dentro do global
     * (global = repasse + contrapartida, na maioria dos casos -- pode
     * divergir um pouco quando termo aditivo mudou o global sem atualizar
     * o repasse). So no SICONV, sem fallback no Portal. */
    repasse: number | null;
    empenhado: number | null;
    desembolsado: number | null;
    contrapartida: number | null;
    saldoConta: number | null;
    /** SICONV nao tem esse recorte (so o valor da ultima parcela liberada
     * mesmo) -- unico campo financeiro que continua vindo do Portal. */
    ultimaLiberacaoValor: number | null;
    /** false quando o SICONV nao tinha o convenio e caiu pro valor (nao
     * confiavel) do Portal -- ver docs/monitoramento-equipamentos.
     * Nao deveria acontecer nos 71 validados, mas o card avisa se acontecer. */
    fonteConfiavel: boolean;
  };
  siconv: SiconvEntrada | null;
  /** Ente do TransfereGov cujo CNPJ bate com o convenente -- aproximacao,
   * pode estar relacionado a OUTROS convenios legados do mesmo CNPJ alem
   * deste (ver `convenios_legados_relacionados` dentro do proprio objeto). */
  transferegov: TransfereGovEnte | null;
};
