export type Regiao = 'Norte' | 'Nordeste' | 'Centro-Oeste' | 'Sudeste' | 'Sul';

export interface Macrorregiao {
  id: string;
  nome: string;
  uf: string;
  regiao: Regiao;
  pop: number;
  nomeEstado: string;
}

export type StatusCobertura = 'Hiperssuficiente' | 'Hipossuficiente';

/** Cobertura agregada de uma macrorregiao (tabela 1 do dashboard, mapa). */
export interface CoberturaRow {
  macroId: string;
  oferta: number; // so SUS (config_denominador_oferta="qt_existente_sus") -- o que entra no calculo de cobertura
  ofertaTotal: number; // SUS + nao-SUS -- so informativo, nao participa do calculo de cobertura
  demanda: number;
  cobertura: number; // percentual, ja calculado pelo backend (GET /macro-coverage)
  status: StatusCobertura;
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
}
