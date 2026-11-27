/** Tamanho da fonte do escopo conforme o comprimento, para sempre caber em duas linhas. */
function tamanhoDoEscopo(texto: string): string {
  const n = texto.length;
  if (n <= 12) return "text-2xl";
  if (n <= 22) return "text-lg";
  if (n <= 34) return "text-base";
  if (n <= 48) return "text-sm";
  if (n <= 64) return "text-xs";
  return "text-[10px]";
}

/** Cartão do cabeçalho: escopo (fonte do número, ajustada para caber em duas linhas) à esquerda; total em destaque com legenda à direita. Tamanho fixo. */
export function RelatorioEscopoResumo({
  escopo,
  rotuloTotal,
  total,
}: {
  escopo: string;
  rotuloTotal: string;
  total?: number;
}) {
  return (
    <div className="flex h-full min-h-14 w-full items-stretch overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[var(--shadow-soft)] sm:w-80">
      <div className="flex min-w-0 flex-1 items-center justify-center px-2 py-2 sm:px-4">
        <p
          className={`m-0 text-center leading-tight font-bold break-words ${tamanhoDoEscopo(escopo)}`}
        >
          {escopo}
        </p>
      </div>
      <div className="flex w-20 shrink-0 flex-col items-center justify-center gap-1 border-l border-border/70 px-2 py-2 sm:w-28 sm:px-3">
        <p className="m-0 text-2xl leading-none font-bold tabular-nums">
          {total?.toLocaleString("pt-BR") ?? "—"}
        </p>
        <p className="m-0 text-[10px] leading-none text-muted-foreground">
          {rotuloTotal.toLowerCase()}
        </p>
      </div>
    </div>
  );
}
