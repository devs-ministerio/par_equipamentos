import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Pagination } from "@/components/common/pagination";
import { estiloCard } from "@/components/features/monitoramento-ui";
import type { InstrumentoMonitoramentoFiltravel } from "@/hooks/use-monitoramento-interno-filtros";

export type InstrumentoResumo = InstrumentoMonitoramentoFiltravel;
const PAGE_SIZE = 20;
const PRESTACAO_CONTAS_CONCLUIDA = "Prestação de Contas Concluída";

export function MonitoramentoOverviewLista({
  instrumentos,
}: {
  instrumentos: InstrumentoResumo[];
}) {
  const [pagina, setPagina] = useState(1);
  useEffect(() => setPagina(1), [instrumentos]);
  const paginaAtual = instrumentos.slice(
    (pagina - 1) * PAGE_SIZE,
    pagina * PAGE_SIZE,
  );
  return (
    <div className={estiloCard}>
      <div className="mb-3 flex flex-wrap justify-between gap-2.5">
        <strong className="text-sm">
          Instrumentos monitorados ({instrumentos.length})
        </strong>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="text-left text-[11px] uppercase text-muted-foreground">
              <th className="px-2 py-1">Instrumentos/Programas</th>
              <th className="px-2 py-1">Convenente</th>
              <th className="px-2 py-1">UF/Município</th>
              <th className="px-2 py-1">Prestação de contas</th>
              <th className="px-2 py-1">Técnico titular</th>
              <th className="px-2 py-1">Fase</th>
            </tr>
          </thead>
          <tbody>
            {instrumentos.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-2 py-3.5 text-center italic text-muted-foreground"
                >
                  Nenhum instrumento bate com esse filtro.
                </td>
              </tr>
            ) : (
              paginaAtual.map((item) => (
                <tr key={item.nr_convenio} className="border-t border-border">
                  <td className="px-2 py-1.5">
                    <Link
                      to={`/monitoramento-equipamentos/instrumentos/${item.nr_convenio}`}
                      className="font-semibold text-primary no-underline"
                    >
                      {item.nr_convenio}
                    </Link>
                    <span className="ml-1.5 rounded-full bg-warning-bg px-1.5 py-px text-[9.5px] font-bold text-warning">
                      {item.tipo_contratacao ?? "Convênio"}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">{item.nome_convenente}</td>
                  <td className="px-2 py-1.5">
                    {item.uf}/{item.municipio}
                  </td>
                  <td className="px-2 py-1.5">
                    {item.situacao_prestacao_contas ===
                    PRESTACAO_CONTAS_CONCLUIDA ? (
                      <span className="rounded-full bg-success-bg px-1.5 py-px text-[10px] font-bold text-success">
                        Concluída
                      </span>
                    ) : (
                      (item.situacao_prestacao_contas ?? "—")
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {item.tecnico_titular ?? (
                      <span className="rounded-full bg-warning-bg px-1.5 py-px text-[10px] font-bold text-warning">
                        Pendente
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">{item.fase_atual ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {instrumentos.length > 0 && (
        <Pagination
          page={pagina}
          totalItems={instrumentos.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPagina}
        />
      )}
    </div>
  );
}
