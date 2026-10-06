/** Conectivos de nome próprio em português que não viram inicial
 * ("Maria DA Silva" → "MS", não "MD"). */
const CONECTIVOS = new Set(["de", "da", "do", "das", "dos", "e", "d'", "del"]);

/** Iniciais para o avatar: primeira letra do primeiro nome + primeira
 * letra do último sobrenome ("IGOR PEREIRA LINS" → "IL"). Nome de uma
 * palavra só vira 1 letra ("Igor" → "I"); vazio vira "?". */
export function iniciaisDoNome(nome: string | null | undefined): string {
  const partes = (nome ?? "")
    .trim()
    .split(/\s+/)
    .filter((parte) => parte && !CONECTIVOS.has(parte.toLowerCase()));
  if (partes.length === 0) return "?";
  const primeira = partes[0].charAt(0);
  if (partes.length === 1) return primeira.toLocaleUpperCase("pt-BR");
  const ultima = partes[partes.length - 1].charAt(0);
  return `${primeira}${ultima}`.toLocaleUpperCase("pt-BR");
}
