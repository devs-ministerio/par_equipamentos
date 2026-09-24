import type { Regiao } from "../types/domain";

/**
 * Referencia geografica fixa (as 27 UFs, suas regioes e nomes) -- nao e dado
 * de negocio (nao muda, nao vem do banco), entao fica hardcoded no front
 * assim como o proprio prototipo original ja fazia (UF_REGIAO/UF_IBGE no
 * .dc.html). O backend so devolve `state` (sigla); regiao/nome do estado sao
 * derivados daqui.
 */
export const UF_INFO: Record<string, { nome: string; regiao: Regiao }> = {
  AC: { nome: "Acre", regiao: "Norte" },
  AL: { nome: "Alagoas", regiao: "Nordeste" },
  AP: { nome: "Amapá", regiao: "Norte" },
  AM: { nome: "Amazonas", regiao: "Norte" },
  BA: { nome: "Bahia", regiao: "Nordeste" },
  CE: { nome: "Ceará", regiao: "Nordeste" },
  DF: { nome: "Distrito Federal", regiao: "Centro-Oeste" },
  ES: { nome: "Espírito Santo", regiao: "Sudeste" },
  GO: { nome: "Goiás", regiao: "Centro-Oeste" },
  MA: { nome: "Maranhão", regiao: "Nordeste" },
  MT: { nome: "Mato Grosso", regiao: "Centro-Oeste" },
  MS: { nome: "Mato Grosso do Sul", regiao: "Centro-Oeste" },
  MG: { nome: "Minas Gerais", regiao: "Sudeste" },
  PA: { nome: "Pará", regiao: "Norte" },
  PB: { nome: "Paraíba", regiao: "Nordeste" },
  PR: { nome: "Paraná", regiao: "Sul" },
  PE: { nome: "Pernambuco", regiao: "Nordeste" },
  PI: { nome: "Piauí", regiao: "Nordeste" },
  RJ: { nome: "Rio de Janeiro", regiao: "Sudeste" },
  RN: { nome: "Rio Grande do Norte", regiao: "Nordeste" },
  RS: { nome: "Rio Grande do Sul", regiao: "Sul" },
  RO: { nome: "Rondônia", regiao: "Norte" },
  RR: { nome: "Roraima", regiao: "Norte" },
  SC: { nome: "Santa Catarina", regiao: "Sul" },
  SP: { nome: "São Paulo", regiao: "Sudeste" },
  SE: { nome: "Sergipe", regiao: "Nordeste" },
  TO: { nome: "Tocantins", regiao: "Norte" },
};
