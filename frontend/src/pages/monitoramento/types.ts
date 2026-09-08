/** Tipos das 3 fontes estaticas (Portal da Transparencia, SICONV legado,
 * TransfereGov novo) e do tipo mesclado que a pagina realmente renderiza --
 * ver mesclarConvenios.ts pro cruzamento. */

/** Lookup id_programa -> nome, gerado por
 * backend/scripts/levantamento_convenios_oncologia.py a partir dos 176
 * `programa` do TransfereGov -- usado pra resolver o `id_programa` (so o
 * numero) que cada proposta de TransfereGovEnte.propostas_expandidas
 * carrega, pro nome legivel do programa aparecer no card do convenio. */
export type ProgramaTransfereGov = {
  id_programa: number;
  nm_programa: string;
  ano_programa: number | null;
};

export type ConvenioPortal = {
  numero: string;
  numero_instrumento: string | null;
  objeto: string;
  situacao: string;
  data_publicacao: string | null;
  data_inicio_vigencia: string | null;
  data_final_vigencia: string | null;
  data_conclusao: string | null;
  data_ultima_liberacao: string | null;
  convenente_nome: string;
  convenente_cnpj: string;
  convenente_tipo: string;
  municipio: string;
  codigo_ibge: string;
  uf: string;
  regiao: string;
  orgao: string;
  unidade_gestora: string;
  subfuncao: string;
  funcao: string;
  tipo_instrumento: string;
  valor: number;
  valor_liberado: number;
  valor_contrapartida: number;
  valor_ultima_liberacao: number;
  numero_processo: string;
};

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
  metas: { cd_meta: number; nm_meta: string; ds_meta: string | null; etapas_proposta: EtapaExpandida[] }[];
  cronograma_desembolso: Record<string, unknown>[];
  distribuicao_recurso: Record<string, unknown>[];
  parcerias: { parceria: Record<string, unknown>; empenhos: Record<string, unknown>[]; documentos_habeis: Record<string, unknown>[] }[];
};

export type TransfereGovEnte = {
  cnpj: string;
  nome: string;
  convenios_legados_relacionados: string[];
  total_propostas_na_api: number;
  propostas_expandidas: PropostaExpandida[];
};

/** Um convenio com as 3 fontes ja cruzadas por numero (Portal + SICONV,
 * 1:1 exato) e por CNPJ (TransfereGov, aproximacao -- ver campo
 * `transferegovAproximado`). Campo que existe em mais de uma fonte usa UM
 * valor so (o mais confiavel), nunca os dois lado a lado -- ver
 * mesclarConvenios.ts pra qual fonte venceu em cada caso. */
export type ConvenioUnificado = {
  numero: string;
  numeroInstrumento: string | null;
  objeto: string;
  situacao: string;
  situacaoContratacao: string | null;
  convenente: { nome: string; cnpj: string; tipo: string };
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
  datas: {
    publicacao: string | null;
    inicioVigencia: string | null;
    fimVigencia: string | null;
    conclusao: string | null;
    ultimaLiberacao: string | null;
  };
  financeiro: {
    global: number | null;
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

/** Propostas do TransfereGov achadas por `programa` (nao por numero de
 * convenio -- FAF SAUDE e um instrumento novo, sem numero legado) que
 * batem com um dos 8 "componente" de financiamento oncologico pedidos
 * (REDE DE ATENCAO.../Politica Nacional de Prevencao e Controle do
 * Cancer...). Casamento por nome normalizado, nao por id_programa fixo --
 * ver backend/scripts/levantamento_convenios_oncologia.py::_componente_alvo_de
 * (o id_programa muda todo ano que a categoria e recriada). */
export type ComponentePropostaApi = {
  id_proposta: number;
  ente_recebedor: string | null;
  cnpj: string | null;
  municipio: string | null;
  uf: string | null;
  situacao_proposta: string | null;
  valor_planejamento: number | null;
  ds_objeto: string | null;
};

export type ComponenteOncologia = {
  componente: string;
  ano_programa: number;
  id_programa: number;
  nm_programa_api: string;
  total_propostas: number;
  propostas: ComponentePropostaApi[];
};
