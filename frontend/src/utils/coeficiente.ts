import { colors } from "../styles/tokens";

export interface CoeficienteInfo {
  /** (equipamentos SUS × produtividade da família) ÷ população SUS-dependente -- null se pop=0 (sem denominador). */
  valor: number | null;
  hiper: boolean;
  /** cor do texto/rótulo -- mais escura, pra leitura. */
  corTexto: string;
  /** cor do preenchimento da barra -- mais clara, pra listra central (coeficiente 1) continuar visível. */
  corBarra: string;
  /** % de preenchimento da barra, já limitado a 100 (a listra central fica sempre em 50%, coeficiente 1). */
  fillPercent: number;
}

/**
 * Coeficiente = (equipamentos SUS × produtividade) ÷ população SUS-dependente
 * -- quantos equipamentos por `produtividade` habitantes essa macro/região de
 * saúde/município tem, sem arredondar a demanda (diferente do required_qty
 * gravado no banco, que é ceil). Usado em toda linha e sub-linha das
 * tabelas de Cobertura Assistencial (CoberturaTable, NivelCoberturaTable e
 * SubNivelRows) -- extraído aqui pra não triplicar a mesma conta.
 *
 * `produtividade` precisa ser a mesma constante que o backend usou pra
 * calcular required_qty/deficit_status dessa família (EQUIPAMENTOS em
 * data/constants.ts, espelhando PRODUTIVIDADE em
 * scripts/run_pipeline_*.py) -- 100 mil pra TOMOGRAFO, mas NAO pra toda
 * família (RESSONANCIA é ~166.667). Default 100_000 só por
 * compatibilidade de assinatura; todo call site novo deve passar o valor
 * explícito da família atual (bug real corrigido 2026-08-21: os 5 call
 * sites tinham esse número fixo, então RESSONANCIA mostrava
 * coeficiente/barra/cor errados mesmo com o StatusBadge já certo).
 */
export function calcularCoeficiente(
  oferta: number,
  pop: number,
  produtividade = 100_000,
): CoeficienteInfo {
  const valor = pop > 0 ? (oferta * produtividade) / pop : null;
  const hiper = valor != null && valor >= 1;
  return {
    valor,
    hiper,
    corTexto:
      valor == null
        ? colors.subtleText
        : hiper
          ? colors.hiperGreen
          : colors.hipoRed,
    corBarra:
      valor == null
        ? colors.subtleText
        : hiper
          ? colors.hiperGreenBarra
          : colors.hipoRedBarra,
    fillPercent: valor != null ? Math.min(100, valor * 50) : 0,
  };
}
