/** Escopo geográfico e total de registros do recorte, no cabeçalho do relatório. */
export function RelatorioEscopoResumo({
  escopo,
  rotuloTotal,
  total,
}: {
  escopo: string;
  rotuloTotal: string;
  total: number;
}) {
  const rotulo =
    "text-[10px] font-bold tracking-[0.1em] text-muted-foreground uppercase";
  return (
    <div className="grid min-w-0 grid-cols-2 gap-x-5 gap-y-2 sm:min-w-52 sm:grid-cols-1">
      <div>
        <p className={rotulo}>Escopo</p>
        <p className="mt-1 break-words text-sm font-semibold">{escopo}</p>
      </div>
      <div>
        <p className={rotulo}>{rotuloTotal}</p>
        <p className="mt-1 text-sm font-semibold tabular-nums">
          {total.toLocaleString("pt-BR")}
        </p>
      </div>
    </div>
  );
}
