import { colors } from '../styles/tokens';

export interface CoeficienteInfo {
  /** (tomógrafos SUS × 100.000) ÷ população SUS-dependente -- null se pop=0 (sem denominador). */
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
 * Coeficiente = (tomógrofos SUS × 100.000) ÷ população SUS-dependente --
 * quantos tomógrafos por 100 mil habitantes essa macro/região de saúde/
 * município tem, sem arredondar a demanda (diferente do required_qty
 * gravado no banco, que é ceil). Usado em toda linha e sub-linha das
 * tabelas de Cobertura Assistencial (CoberturaTable, NivelCoberturaTable e
 * SubNivelRows) -- extraído aqui pra não triplicar a mesma conta.
 */
export function calcularCoeficiente(oferta: number, pop: number): CoeficienteInfo {
  const valor = pop > 0 ? (oferta * 100_000) / pop : null;
  const hiper = valor != null && valor >= 1;
  return {
    valor,
    hiper,
    corTexto: valor == null ? colors.subtleText : hiper ? colors.hiperGreen : colors.hipoRed,
    corBarra: valor == null ? colors.subtleText : hiper ? colors.hiperGreenBarra : colors.hipoRedBarra,
    fillPercent: valor != null ? Math.min(100, valor * 50) : 0,
  };
}
