import { useState } from "react";
import { Pagination } from "@/components/common/pagination";
import { estiloCard } from "@/components/features/monitoramento-ui";
import { fmtMoeda } from "@/lib/monitoramento-format";
import { capitalizarNome } from "@/utils/texto";
import type { ConvenioUnificado } from "@/types/monitoramento";

const PAGE_SIZE = 20;

/** Tabela de prévia de "Instrumentos/Programas" (convênios) do relatório de
 * Instrumentos e Repasse -- mostra exatamente o recorte que os filtros
 * acima vão gerar no Excel/Word. Mesmo padrão de layout/formatação da
 * tabela de Instrumentos Monitorados (`monitoramento-overview-lista.tsx`):
 * card + `<table>` nativa + paginação (Seção 5 da constituição: coluna
 * numérica sempre alinhada à direita).
 *
 * Colunas com largura em **porcentagem** (`table-fixed` + `<colgroup>`),
 * não pixel fixo -- a tabela sempre cabe exatamente na largura do card,
 * encolhendo célula por célula (`truncate` + `title` no hover) em vez de
 * estourar e pedir rolagem horizontal (pedido explícito do usuário
 * 2026-09-26: "não quero barra de rolagem horizontal"). Client-side: os
 * itens já chegam filtrados pela página (mesmo dado de `useConveniosLista`,
 * sem chamada nova). */
export function RelatorioInstrumentosTabela({
  itens,
  faseMonitoramento,
}: {
  itens: ConvenioUnificado[];
  /** `nr_convenio` (= `item.numero`) -> fase atual do monitoramento
   * interno -- `undefined` quando o instrumento não é monitorado
   * internamente. */
  faseMonitoramento: Map<string, string>;
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
      <table className="w-full table-fixed border-collapse text-[12.5px]">
        <colgroup>
          <col style={{ width: "9%" }} />
          <col style={{ width: "7%" }} />
          <col style={{ width: "21%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "11%" }} />
          <col style={{ width: "11%" }} />
          <col style={{ width: "5%" }} />
          <col style={{ width: "10%" }} />
        </colgroup>
        <thead>
          <tr className="text-left text-[11px] text-muted-foreground uppercase">
            <th className="px-2 py-1">Número</th>
            <th className="px-2 py-1">CNES</th>
            <th className="px-2 py-1">Convenente</th>
            <th className="px-2 py-1">Município/UF</th>
            <th className="px-2 py-1">Equipamento</th>
            <th className="px-2 py-1">Situação (Site)</th>
            <th className="px-2 py-1">Situação</th>
            <th className="px-2 py-1 text-right">Ano</th>
            <th className="px-2 py-1 text-right">Valor global</th>
          </tr>
        </thead>
        <tbody>
          {itens.length === 0 ? (
            <tr>
              <td
                colSpan={9}
                className="px-2 py-3.5 text-center text-muted-foreground italic"
              >
                Nenhum instrumento bate com esse filtro.
              </td>
            </tr>
          ) : (
            paginaAtual.map((item) => {
              const equipamentos = item.equipamentos
                .map((e) => e.nome)
                .join(", ");
              const faseInterna = faseMonitoramento.get(item.numero);
              return (
                <tr key={item.numero} className="border-t border-border">
                  <td
                    className="truncate px-2 py-1.5 font-mono font-semibold"
                    title={item.numero}
                  >
                    {item.numero}
                  </td>
                  <td
                    className="truncate px-2 py-1.5 font-mono text-muted-foreground"
                    title={item.cnes ?? undefined}
                  >
                    {item.cnes ?? "—"}
                  </td>
                  <td
                    className="truncate px-2 py-1.5"
                    title={item.convenente.nome}
                  >
                    {item.convenente.nome}
                  </td>
                  <td
                    className="truncate px-2 py-1.5"
                    title={`${capitalizarNome(item.municipio)}/${item.uf}`}
                  >
                    {capitalizarNome(item.municipio)}/{item.uf}
                  </td>
                  <td
                    className="truncate px-2 py-1.5 text-muted-foreground"
                    title={equipamentos || undefined}
                  >
                    {equipamentos || "—"}
                  </td>
                  <td
                    className="truncate px-2 py-1.5 text-muted-foreground"
                    title={item.situacao ?? undefined}
                  >
                    {item.situacao ?? "—"}
                  </td>
                  <td
                    className="truncate px-2 py-1.5 text-muted-foreground"
                    title={faseInterna ?? undefined}
                  >
                    {faseInterna ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {item.numeroInstrumento?.split("/")[1] ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold">
                    {fmtMoeda(item.financeiro.global)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
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
