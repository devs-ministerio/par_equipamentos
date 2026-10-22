import { Pagination } from "@/components/common/pagination";
import type { RegistroEncerrado } from "@/services/relatorios-encerrados";

interface Props {
  titulo: string;
  itens: RegistroEncerrado[];
  total: number;
  pagina: number;
  onPaginaChange: (pagina: number) => void;
}

export function RelatorioEncerradosPrevia({
  titulo,
  itens,
  total,
  pagina,
  onPaginaChange,
}: Props) {
  return (
    <section
      className="min-w-0 rounded-sm border border-border bg-card"
      aria-label={titulo}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
        <h3 className="font-semibold">{titulo}</h3>
        <span className="text-sm tabular-nums text-muted-foreground">
          {total} registros
        </span>
      </header>
      {itens.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          Nenhum registro neste recorte.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {itens.map((item) => (
            <li
              key={item.chave}
              className="grid min-w-0 gap-3 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
            >
              <div className="min-w-0">
                <p className="break-words font-semibold">{item.nome}</p>
                <p className="mt-1 break-words text-sm text-muted-foreground">
                  {item.numero} · {item.tipo} ·{" "}
                  {item.municipio ?? "Município não informado"}/{item.uf ?? "—"}
                </p>
              </div>
              <div className="min-w-0">
                <p
                  className={
                    item.pendencia
                      ? "text-sm font-semibold text-warning"
                      : "text-sm font-semibold text-primary"
                  }
                >
                  {item.motivo}
                </p>
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {item.evidencia}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={pagina}
        totalItems={total}
        pageSize={20}
        onPageChange={onPaginaChange}
        mobileStacked
      />
    </section>
  );
}
