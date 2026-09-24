import { normalizarTexto } from "@/utils/texto";

export const SITUACOES_INSTRUMENTO_CONCLUIDO = new Set([
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
