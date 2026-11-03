import { Pagination } from "@/components/common/pagination";
import { fmtData } from "@/lib/monitoramento-format";
import type {
  ContagemSituacao,
  RegistroPrevisao,
} from "@/services/relatorios-previsoes";

interface Props {
  itens: RegistroPrevisao[];
  total: number;
  contagens: ContagemSituacao[];
  pagina: number;
  onPaginaChange: (pagina: number) => void;
}

function data(valor: string | null) {
  return valor ? fmtData(valor) : "—";
}

export function RelatorioPrevisoesPrevia({
  itens,
  total,
  contagens,
  pagina,
  onPaginaChange,
}: Props) {
  return (
    <section
      className="min-w-0 rounded-sm border border-border bg-card"
      aria-label="Conclusão e previsões"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
        <h3 className="font-semibold">Conclusão e previsões</h3>
        <span className="text-sm tabular-nums text-muted-foreground">
          {total} instrumentos
        </span>
      </header>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-border p-4 text-sm sm:grid-cols-3 lg:grid-cols-4">
        {contagens.map((c) => (
          <div key={c.codigo} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{c.rotulo}</dt>
            <dd className="tabular-nums font-semibold">{c.quantidade}</dd>
          </div>
        ))}
      </dl>
      {itens.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          Nenhum instrumento neste recorte.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {itens.map((item) => (
            <li
              key={item.instrumento}
              className="grid min-w-0 gap-3 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
            >
              <div className="min-w-0">
                <p className="break-words font-semibold">{item.convenente}</p>
                <p className="mt-1 break-words text-sm text-muted-foreground">
                  Nº {item.instrumento} · {item.tipo}
                </p>
                <p className="break-words text-sm text-muted-foreground">
                  {item.municipio ?? "Município não informado"}/{item.uf ?? "—"}
                </p>
              </div>
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-primary">
                  {item.situacao}
                </p>
                <p className="mt-1 break-words text-sm tabular-nums">
                  <span className="text-muted-foreground">Conclusão: </span>
                  {data(item.data_conclusao)}
                  <span className="text-muted-foreground"> · Inaugurado: </span>
                  {data(item.inauguracao_real)}
                  <span className="text-muted-foreground"> · Previsão: </span>
                  {data(item.previsao_inauguracao)}
                  {item.dias_ate_previsao !== null && (
                    <span className="text-muted-foreground">
                      {" "}
                      ({item.dias_ate_previsao} dias)
                    </span>
                  )}
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
