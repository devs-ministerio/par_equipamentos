import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { Pagination } from "@/components/common/pagination";
import { useListaPaginada } from "@/hooks/useListaPaginada";
import { cn } from "@/lib/utils";
import { fmtData } from "@/lib/monitoramento-format";
import type {
  InauguracaoResumo,
  LicencaVencendoResumo,
} from "@/services/monitoramento-resumo";

const TAMANHO_PAGINA = 7;

export function AgendaExecutiva({
  inauguracoes,
  licencas,
}: {
  inauguracoes: InauguracaoResumo[];
  licencas: LicencaVencendoResumo[];
}) {
  const itens = [
    ...licencas.map((item) => ({
      chave: `licenca-${item.nr_convenio}`,
      nr: item.nr_convenio,
      titulo: item.nome_convenente,
      meta: "Licença CNEN",
      prazo:
        item.dias < 0
          ? `Vencida há ${Math.abs(item.dias)} dias`
          : `Vence em ${item.dias} dias`,
      dias: item.dias,
      critico: item.dias < 90,
    })),
    ...inauguracoes
      .filter((item) => !item.realizada)
      .map((item) => ({
        chave: `inauguracao-${item.nr_convenio}`,
        nr: item.nr_convenio,
        titulo: item.nome_convenente,
        meta: `Inauguração · ${fmtData(item.data)}`,
        prazo:
          item.dias < 0
            ? `Atrasada há ${Math.abs(item.dias)} dias`
            : `Em ${item.dias} dias`,
        dias: item.dias,
        critico: item.dias < 0,
      })),
  ].sort((a, b) => a.dias - b.dias || a.chave.localeCompare(b.chave));
  const { pagina, definirPagina, inicio } = useListaPaginada(
    itens.length,
    TAMANHO_PAGINA,
    itens.map((item) => `${item.chave}:${item.dias}`).join("|"),
  );

  if (itens.length === 0)
    return (
      <p className="py-4 text-sm text-muted-foreground">
        Nenhum prazo crítico registrado.
      </p>
    );
  return (
    <div className="flex flex-1 flex-col">
      <div className="divide-y divide-border">
        {itens.slice(inicio, inicio + TAMANHO_PAGINA).map((item) => (
          <Link
            key={item.chave}
            to={`/monitoramento-equipamentos/instrumentos/${encodeURIComponent(item.nr)}`}
            className="group grid gap-1 py-3 text-inherit sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-3"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{item.titulo}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {item.meta} · {item.nr}
              </div>
            </div>
            <div
              className={cn(
                "flex items-center gap-1 text-xs font-semibold sm:justify-end",
                item.critico ? "text-destructive" : "text-warning",
              )}
            >
              {item.prazo}
              <ArrowUpRight
                size={13}
                className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
            </div>
          </Link>
        ))}
      </div>
      {itens.length > TAMANHO_PAGINA && (
        <nav aria-label="Paginação da agenda de prazos" className="mt-auto">
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
