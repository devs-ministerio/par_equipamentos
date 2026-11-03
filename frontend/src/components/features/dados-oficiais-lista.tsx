import { ConvenioCard } from "@/components/features/convenio-card";
import { Pagination } from "@/components/common/pagination";
import type { ConvenioUnificado } from "@/types/monitoramento";
import type { Acompanhamento } from "@/lib/acompanhamento-instrumento";

export function DadosOficiaisLista({
  itens,
  monitorados,
  fases,
  acompanhamentos,
  pagina,
  total,
  onPagina,
}: {
  itens: ConvenioUnificado[];
  monitorados: Set<string>;
  fases: Map<string, string>;
  acompanhamentos: Map<string, Acompanhamento>;
  pagina: number;
  total: number;
  onPagina: (pagina: number) => void;
}) {
  return (
    <>
      {itens.length === 0 && (
        <p role="status" className="py-6 text-sm text-muted-foreground">
          Nenhum instrumento encontrado. Ajuste ou limpe os filtros para ampliar
          a busca.
        </p>
      )}
      <>
        {itens.map((item) => (
          <ConvenioCard
            key={item.numero}
            c={item}
            monitorado={monitorados.has(item.numero)}
            faseMonitoramento={fases.get(item.numero) ?? null}
            acompanhamento={acompanhamentos.get(item.numero) ?? null}
          />
        ))}
      </>
      <div className="mt-1 rounded-[10px] border border-border bg-card">
        <Pagination
          page={pagina}
          totalItems={total}
          pageSize={20}
          onPageChange={onPagina}
        />
      </div>
    </>
  );
}
