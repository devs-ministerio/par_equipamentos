import { Link } from "react-router-dom";
import { Pagination } from "@/components/common/pagination";
import { useListaPaginada } from "@/hooks/useListaPaginada";
import type { DivergenciaConclusao } from "@/services/monitoramento-resumo";

const TAMANHO_PAGINA = 8;

export function DivergenciasConclusao({
  itens,
}: {
  itens: DivergenciaConclusao[];
}) {
  const { pagina, definirPagina, inicio } = useListaPaginada(
    itens.length,
    TAMANHO_PAGINA,
    itens.map((item) => item.nr_convenio).join("|"),
  );
  if (itens.length === 0)
    return (
      <p className="py-4 text-sm text-muted-foreground">
        Nenhuma divergência de conclusão registrada.
      </p>
    );
  return (
    <div className="flex flex-1 flex-col">
      <div className="divide-y divide-border">
        {itens.slice(inicio, inicio + TAMANHO_PAGINA).map((item) => (
          <Link
            key={item.nr_convenio}
            to={`/monitoramento-equipamentos/instrumentos/${encodeURIComponent(item.nr_convenio)}`}
            className="group grid gap-1 py-3 text-inherit sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {item.nome_convenente}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {item.nr_convenio} ·{" "}
                {item.tipo_contratacao ?? "Fonte não informada"} ·{" "}
                {item.fase_interna}
              </div>
            </div>
            <div className="text-left text-xs sm:text-right">
              <div className="font-semibold text-destructive">{item.risco}</div>
              <div className="text-muted-foreground">
                {item.status_externo_original}
              </div>
            </div>
          </Link>
        ))}
      </div>
      {itens.length > TAMANHO_PAGINA && (
        <nav aria-label="Paginação de divergências" className="mt-auto">
          <Pagination
            page={pagina}
            totalItems={itens.length}
            pageSize={TAMANHO_PAGINA}
            onPageChange={definirPagina}
          />
        </nav>
      )}
    </div>
  );
}
