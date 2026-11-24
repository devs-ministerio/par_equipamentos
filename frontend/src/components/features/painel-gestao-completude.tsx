interface Props {
  total: number;
  semCnes: number;
  semCoordenadas: number;
  semTecnico: number;
  semAno: number;
  comPagamentoDeterminado: number;
  cargasManuais: number;
}

/** Preenchimento dos campos-chave do recorte (só admin). */
export function PainelGestaoCompletude({
  total,
  semCnes,
  semCoordenadas,
  semTecnico,
  semAno,
  comPagamentoDeterminado,
  cargasManuais,
}: Props) {
  const itens = [
    { rotulo: "CNES vinculado", valor: total - semCnes },
    { rotulo: "Coordenadas CNES", valor: total - semCoordenadas },
    { rotulo: "Técnico titular", valor: total - semTecnico },
    { rotulo: "Ano do instrumento", valor: total - semAno },
    { rotulo: "Base de pagamento", valor: comPagamentoDeterminado },
  ];
  return (
    <section
      aria-labelledby="completude-titulo"
      className="rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6"
    >
      <h3
        id="completude-titulo"
        className="m-0 text-base font-semibold tracking-tight"
      >
        Completude do recorte
      </h3>
      <ul className="m-0 mt-5 grid list-none grid-cols-2 gap-4 p-0 lg:grid-cols-5">
        {itens.map((item) => {
          const pct = total ? Math.round((100 * item.valor) / total) : 0;
          return (
            <li key={item.rotulo} className="min-w-0">
              <p className="m-0 text-xs font-medium text-muted-foreground">
                {item.rotulo}
              </p>
              <p className="m-0 mt-1 flex items-baseline justify-between gap-2">
                <strong className="font-display text-xl tabular-nums">
                  {item.valor}/{total}
                </strong>
                <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                  {pct}%
                </span>
              </p>
              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"
                aria-hidden="true"
              >
                <div
                  className={`h-full rounded-full ${pct === 100 ? "bg-success" : pct === 0 ? "bg-destructive" : "bg-warning"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {cargasManuais > 0 && (
        <p className="m-0 mt-5 text-xs leading-relaxed text-muted-foreground">
          {cargasManuais} cargas manuais têm valor global informado e desembolso
          integral por regra da fonte. Pagamento ao fornecedor só é assumido
          quando a fase interna está concluída.
        </p>
      )}
    </section>
  );
}
