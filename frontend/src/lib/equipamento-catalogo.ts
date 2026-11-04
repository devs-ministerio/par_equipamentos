import { normalizarTexto } from "@/utils/texto";

/** Situações que o indicador "Concluídos" reconhece: a conclusão registrada no monitoramento interno ("Concluído",
 * que a situação exibida usa quando o instrumento é monitorado) e os encerramentos do SICONV. Cartão, filtro e
 * indicador usam a mesma situação exibida, então o conjunto precisa cobrir as duas origens (D15). */
export const SITUACOES_INSTRUMENTO_CONCLUIDO = new Set([
  "Concluído",
  "Prestação de Contas Concluída",
  "Em operação",
]);

export function nomePrioritarioCanonico(nome: string): string | null {
  const texto = normalizarTexto(nome);
  if (/acelerad|linac/.test(texto)) return "Acelerador Linear";
  if (/mamograf/.test(texto)) return "Mamógrafo";
  if (/pet\s*[/ -]?\s*ct/.test(texto)) return "PET/CT";
  if (/gama\s*camara|spect/.test(texto)) return "Gama-câmara/SPECT";
  if (/braquiterapia/.test(texto)) return "Braquiterapia";
  return null;
}

export function resumirEquipamentoNaoPrioritario(nome: string): string {
  const semCodigo = nome.replace(/^\s*\d+\s*-\s*/, "").trim();
  return semCodigo.length > 52
    ? `${semCodigo.slice(0, 49).trimEnd()}…`
    : semCodigo;
}
