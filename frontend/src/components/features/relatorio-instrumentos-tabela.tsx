import { useState } from "react";
import { Pagination } from "@/components/common/pagination";
import { estiloCard } from "@/components/features/monitoramento-ui";
import { fmtMoeda } from "@/lib/monitoramento-format";
import type { ConvenioUnificado } from "@/types/monitoramento";

const PAGE_SIZE = 20;

/** Tabela de prévia de "Instrumentos/Programas" (convênios) do relatório de
 * Instrumentos e Repasse -- mostra exatamente o recorte que os filtros
 * acima vão gerar no Excel/Word. Mesmo padrão de layout/formatação da
 * tabela de Instrumentos Monitorados (`monitoramento-overview-lista.tsx`,
 * pedido do usuário 2026-09-26): card + `<table>` nativa + badge de tipo +
 * paginação -- só as colunas são outras (Seção 5 da constituição: coluna
 * numérica sempre alinhada à direita). Client-side: os itens já chegam
 * filtrados pela página (mesmo dado de `useConveniosLista`, sem chamada
 * nova). */
export function RelatorioInstrumentosTabela({
  itens,
}: {
  itens: ConvenioUnificado[];
}) {
  const [pagina, setPagina] = useState(1);
  const paginaAtual = itens.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE);

  return (
    <div className={estiloCard}>
      <div className="mb-3 flex flex-wrap justify-between gap-2.5">
        <strong className="text-sm">
          Instrumentos/Programas ({itens.length})
        </strong>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="text-left text-[11px] text-muted-foreground uppercase">
              <th className="px-2 py-1">Número</th>
              <th className="px-2 py-1">Convenente</th>
              <th className="px-2 py-1">Município/UF</th>
              <th className="px-2 py-1">Situação</th>
              <th className="px-2 py-1 text-right">Ano</th>
              <th className="px-2 py-1 text-right">Valor global</th>
            </tr>
          </thead>
          <tbody>
            {itens.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-2 py-3.5 text-center text-muted-foreground italic"
                >
                  Nenhum instrumento bate com esse filtro.
                </td>
              </tr>
            ) : (
              paginaAtual.map((item) => (
                <tr key={item.numero} className="border-t border-border">
                  <td className="px-2 py-1.5">
                    <span className="font-semibold">{item.numero}</span>
                    <span className="ml-1.5 rounded-full bg-warning-bg px-1.5 py-px text-[9.5px] font-bold text-warning">
                      {item.tipoContratacao ?? "Convênio"}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">{item.convenente.nome}</td>
                  <td className="px-2 py-1.5">
                    {item.municipio}/{item.uf}
                  </td>
                  <td className="px-2 py-1.5">{item.situacao}</td>
                  <td className="px-2 py-1.5 text-right">
                    {item.numeroInstrumento?.split("/")[1] ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold">
                    {fmtMoeda(item.financeiro.global)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {itens.length > 0 && (
        <Pagination
          page={pagina}
          totalItems={itens.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPagina}
        />
      )}
    </div>
  );
}
