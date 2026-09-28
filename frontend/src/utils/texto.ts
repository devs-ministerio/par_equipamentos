/** Remove acentos e ignora caixa -- "Sao Paulo" precisa achar "São Paulo" e vice-versa. */
export function normalizarTexto(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** "12345678000190" -> "12.345.678/0001-90" -- só formatação de exibição,
 * nunca grava de volta no banco (o valor canônico continua só dígitos, ver
 * CHECK constraint em `instrumento_equipamento`/`convenio`/etc). Valor que
 * não tem exatamente 14 dígitos volta como veio, sem tentar adivinhar
 * máscara de dado legado/malformado. */
export function formatarCnpj(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const digitos = valor.replace(/\D/g, "");
  if (digitos.length !== 14) return valor;
  return digitos.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5",
  );
}

/** "SAO PAULO"/"são paulo" -> "São Paulo" -- só resolve maiúsculo/minúsculo,
 * não reconstrói acento que a fonte nunca tinha (não dá pra adivinhar "São"
 * a partir de "SAO" sem um dicionário de municípios). Usado pra exibir um
 * rótulo consistente quando a mesma cidade chega grafada de jeitos
 * diferentes por origem (achado 2026-09-26, "não da pra ter dois São
 * Paulo um minúsculo, um maiúsculo e um sem acento"). */
export function capitalizarNome(texto: string): string {
  return texto
    .toLowerCase()
    .split(" ")
    .map((parte) =>
      parte ? parte.charAt(0).toUpperCase() + parte.slice(1) : parte,
    )
    .join(" ");
}
