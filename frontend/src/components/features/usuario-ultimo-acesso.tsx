/** Data administrativa de login; ausência do campo indica backend anterior. */
export function UsuarioUltimoAcesso({
  ultimoLoginEm,
}: {
  ultimoLoginEm?: string | null;
}) {
  if (ultimoLoginEm === undefined) return <span>Indisponível</span>;
  if (ultimoLoginEm === null) return <span>Sem registro</span>;
  return (
    <time
      dateTime={ultimoLoginEm}
      title="Último login bem-sucedido · horário de Brasília"
    >
      {new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(ultimoLoginEm))}
    </time>
  );
}
