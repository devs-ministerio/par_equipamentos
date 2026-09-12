export type Regiao = 'Norte' | 'Nordeste' | 'Centro-Oeste' | 'Sudeste' | 'Sul';

export interface Macrorregiao {
  id: string;
  nome: string;
  uf: string;
  regiao: Regiao;
  /** Populacao SUS-dependente (IBGE ao vivo do SIDRA - beneficiarios ANS do
   * arquivo de referencia, nunca negativa) -- e o denominador de demanda
   * usado no calculo de cobertura (consistente com a oferta ja ser so-SUS). */
  pop: number;
  /** So informativo -- populacao IBGE total (residente), ao vivo do SIDRA. */
  popResidente: number;
  /** So informativo -- beneficiarios de plano de saude (arquivo de referencia). */
  popAns: number;
  nomeEstado: string;
}

export type StatusCobertura = 'Hiperssuficiente' | 'Hipossuficiente' | 'Dados indisponíveis';

/** Cobertura agregada de uma macrorregiao (tabela 1 do dashboard, mapa). */
export interface CoberturaRow {
  macroId: string;
  oferta: number; // so SUS (config_denominador_oferta="qt_existente_sus") -- o que entra no calculo de cobertura
  ofertaTotal: number; // SUS + nao-SUS -- so informativo, nao participa do calculo de cobertura
  demanda: number;
  cobertura: number; // percentual, ja calculado pelo backend (GET /macro-coverage)
  status: StatusCobertura;
}

/**
 * Linha da tabela "Cobertura Assistencial" quando o filtro escolhido afunila
 * ate Regiao de Saude (nivel='regiaoSaude') ou Municipio/CNES
 * (nivel='municipio') -- GET /health-region-coverage e GET
 * /municipality-coverage, respectivamente. Mesmo shape nos dois niveis pra
 * dar pra usar um componente de tabela so (NivelCoberturaTable).
 */
export interface NivelCoberturaRow {
  /** codigo da regiao de saude ou o co_ibge do municipio -- chave unica da linha. */
  chave: string;
  nome: string;
  uf: string;
  /** so presente/relevante no nivel municipio (nome da regiao de saude a que pertence). */
  regiaoSaudeNome?: string | null;
  /** so presente/relevante no nivel municipio (codigo da regiao de saude a que pertence, pra cascata de filtro). */
  regiaoSaudeId?: string | null;
  macroNome: string | null;
  /** codigo da macro -- pra cascata de filtro ao clicar numa sub-linha (drill-down). */
  macroId: string | null;
  pop: number;
  popResidente: number;
  popAns: number;
  oferta: number;
  ofertaTotal: number;
  cobertura: number;
  status: StatusCobertura;
  /** So presente/relevante no nivel municipio, e so pra TOMOGRAFO (unica
   * familia cujo pipeline calcula isso hoje, ver backend/app/pipeline/geo.py)
   * -- distancia (km) ate o equipamento SUS geocodificado mais proximo, so
   * informativo (NAO entra na classificacao Hipo/Hiper, que continua so
   * populacional -- ver comentario em MunicipioDetalheModal.tsx). */
  distanciaKmEquipamentoMaisProximo?: number | null;
  /** So presente/relevante no nivel municipio -- coordenada da sede,
   * alimenta o mapa "recorte da macrorregiao" quando o raio de 75 km e
   * centralizado no proprio municipio (ver comentario em
   * backend/app/schemas.py::MunicipalityCoverageRead). */
  latitude?: number | null;
  longitude?: number | null;
  /** Codigo IBGE de 7 digitos (com digito verificador) -- so presente no
   * nivel municipio. Usado pra buscar o contorno REAL do municipio
   * (poligono oficial, ver MapaPage.tsx) na API de malhas do IBGE, que
   * exige esse formato em vez do de 6 digitos que o resto do sistema usa
   * (mesma convencao do DATASUS/CNES). */
  ibgeCode7?: string | null;
}

export interface TipoEquipamento {
  tipo: string; // subtipo/canais: 4/16/32/64/128 canais, ou "Não informado"
  qtd: number;
}

/**
 * Linha da tabela "Estabelecimento por equipamento" (tabela 2 do dashboard) --
 * um CNES pode ter mais de um tomografo com subtipos diferentes no
 * ElastiCNES (linhas separadas na fonte); aqui ja vem agregado por
 * estabelecimento, com `tipos` guardando a quebra por subtipo (mostrada na
 * linha expandida). Sem `modelo`/`situacao` -- o ElastiCNES real nao
 * fornece esses campos (decisao de 2026-08-14); `susFlag` substitui a
 * antiga coluna Situacao.
 */
export interface EstabelecimentoRow {
  cnes: string;
  nome: string;
  municipio: string;
  uf: string;
  macroId: string | null;
  macroNome: string | null;
  regiaoSaudeId: string | null;
  regiaoSaudeNome: string | null;
  tipos: TipoEquipamento[];
  qtd: number;
  qtdUso: number;
  susFlag: boolean;
  /** Nulo pra ~6% dos estabelecimentos (sem geocodificacao no CNES) --
   * alimenta os pontos plotados no MacroMap.tsx. */
  latitude: number | null;
  longitude: number | null;
}
