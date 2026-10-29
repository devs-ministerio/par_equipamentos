import { Pagination } from "@/components/common/pagination";
import { fmtData } from "@/lib/monitoramento-format";
import type { RegistroEntregue } from "@/services/relatorios-entregues";

interface Props {
  itens: RegistroEntregue[];
  total: number;
  pagina: number;
  onPaginaChange: (pagina: number) => void;
}

export function RelatorioEntreguesPrevia({
  itens,
  total,
  pagina,
  onPaginaChange,
}: Props) {
  return (
    <section
      className="min-w-0 rounded-sm border border-border bg-card"
      aria-label="Equipamentos entregues"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
        <h3 className="font-semibold">Equipamentos entregues</h3>
        <span className="text-sm tabular-nums text-muted-foreground">
          {total} unidades
        </span>
      </header>
      {itens.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          Nenhuma unidade entregue neste recorte.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {itens.map((item) => (
            <li
              key={`${item.instrumento}-${item.item}-${item.ordem}-${item.numero_serie ?? ""}`}
              className="grid min-w-0 gap-3 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
            >
              <div className="min-w-0">
                <p className="break-words font-semibold">{item.convenente}</p>
                <p className="mt-1 break-words text-sm text-muted-foreground">
                  Nº {item.instrumento} · CNES {item.cnes ?? "—"} · {item.tipo}
                </p>
                <p className="break-words text-sm text-muted-foreground">
                  {item.municipio ?? "Município não informado"}/{item.uf ?? "—"}
                </p>
              </div>
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-primary">
                  {item.item} · unidade {item.ordem}
                </p>
                <p className="mt-1 break-words text-sm">
                  <span className="text-muted-foreground">Marca: </span>
                  {item.marca ?? "—"}
                  <span className="text-muted-foreground"> · Modelo: </span>
                  {item.modelo ?? "—"}
                </p>
                <p className="break-words text-sm tabular-nums">
                  <span className="text-muted-foreground">Série: </span>
                  {item.numero_serie ?? "—"}
                  <span className="text-muted-foreground"> · Vida útil: </span>
                  {item.vida_util_anos !== null
                    ? `${item.vida_util_anos} anos`
                    : "—"}
                  <span className="text-muted-foreground"> · Entrega: </span>
                  {fmtData(item.data_entrega)}
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
