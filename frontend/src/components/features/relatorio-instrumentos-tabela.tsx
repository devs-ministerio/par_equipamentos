import { useState } from "react";
import { Pagination } from "@/components/common/pagination";
import { Button } from "@/components/ui/button";
import { estiloCard, StatusPill } from "@/components/features/monitoramento-ui";
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
 * nunca pedindo rolagem horizontal (pedido explícito do usuário
 * 2026-09-26: "não quero barra de rolagem horizontal"). Correção do mesmo
 * dia ("tabelas com quebra de texto pro nome do estabelecimento, aumentar
 * a largura das outras colunas pra não esconder dado com ..."): Convenente
 * (nome do estabelecimento) usa `whitespace-normal break-words` -- quebra
 * em várias linhas em vez de cortar com reticências -- e as colunas
 * cresceram (Convenente 21%->26%, Equipamento 14%->18%) tirando espaço só
 * das colunas curtas (Número/CNES/Ano), que continuam de linha única. A
 * altura da linha cresce com o texto, a largura da tabela não. Client-side:
 * os itens já chegam filtrados pela página (mesmo dado de
 * `useConveniosLista`, sem chamada nova). */
export function RelatorioInstrumentosTabela({
  itens,
  faseMonitoramento,
  onLimparFiltros,
}: {
  itens: ConvenioUnificado[];
  /** `nr_convenio` (= `item.numero`) -> fase atual do monitoramento
   * interno -- `undefined` quando o instrumento não é monitorado
   * internamente. */
  faseMonitoramento: Map<string, string>;
  onLimparFiltros?: () => void;
}) {
  const [pagina, setPagina] = useState(1);
  const paginaAtual = itens.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE);

  return (
    <section
      className={estiloCard}
      aria-labelledby="relatorio-instrumentos-titulo"
    >
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-[10px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
            <span className="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground">
              02
            </span>
            Instrumentos e programas
          </p>
          <h2
            id="relatorio-instrumentos-titulo"
            className="mt-2 font-display text-xl font-bold tracking-[-0.035em] text-foreground sm:text-2xl"
          >
            Convênios e instrumentos firmados
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {itens.length}{" "}
            {itens.length === 1
              ? "registro encontrado"
              : "registros encontrados"}
          </p>
        </div>
      </header>
      <div className="hidden overflow-hidden xl:block">
        <table className="w-full table-fixed border-collapse text-[12.5px]">
          <colgroup>
            <col style={{ width: "13%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "10%" }} />
          </colgroup>
          <thead>
            <tr className="bg-muted/65 text-left text-[10px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
              <th className="px-2.5 py-3">Número</th>
              <th className="px-2.5 py-3">CNES</th>
              <th className="px-2.5 py-3">Convenente</th>
              <th className="px-2.5 py-3">Município/UF</th>
              <th className="px-2.5 py-3">Equipamento</th>
              <th className="px-2.5 py-3">Situação (Site)</th>
              <th className="px-2.5 py-3">Monitoramento</th>
              <th className="px-2.5 py-3 text-right">Ano</th>
              <th className="px-2.5 py-3 text-right">Valor global</th>
            </tr>
          </thead>
          <tbody>
            {itens.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-2 py-3.5 text-center text-muted-foreground italic"
                >
                  <div className="flex flex-col items-center gap-2 py-3">
                    <span>Nenhum instrumento bate com esse filtro.</span>
                    {onLimparFiltros && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onLimparFiltros}
                      >
                        Limpar filtros
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginaAtual.map((item) => {
                const equipamentos = item.equipamentos
                  .map((e) => e.nome)
                  .join(", ");
                const faseInterna = faseMonitoramento.get(item.numero);
                return (
                  <tr
                    key={item.numero}
                    className="border-t border-border transition-colors duration-150 hover:bg-muted/35"
                  >
                    <td
                      className="break-all px-2.5 py-3 font-mono text-[11px] font-semibold"
                      title={item.numero}
                    >
                      {item.numero}
                    </td>
                    <td
                      className="truncate px-2.5 py-3 font-mono text-[11px] text-muted-foreground"
                      title={item.cnes ?? undefined}
                    >
                      {item.cnes ?? "—"}
                    </td>
                    <td className="px-2.5 py-3 break-words whitespace-normal font-medium">
                      {item.convenente.nome}
                    </td>
                    <td
                      className="truncate px-2.5 py-3"
                      title={`${capitalizarNome(item.municipio)}/${item.uf}`}
                    >
                      {capitalizarNome(item.municipio)}/{item.uf}
                    </td>
                    <td className="px-2.5 py-3 break-words whitespace-normal text-muted-foreground">
                      {equipamentos || "—"}
                    </td>
                    <td
                      className="truncate px-2.5 py-3 text-muted-foreground"
                      title={item.situacao ?? undefined}
                    >
                      {item.situacao ?? "—"}
                    </td>
                    <td
                      className="px-2.5 py-3"
                      title={faseInterna ?? undefined}
                    >
                      {faseInterna ? (
                        <span className="block break-words text-xs font-medium leading-snug text-foreground">
                          {faseInterna}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2.5 py-3 text-right tabular-nums">
                      <span
                        className="block break-words"
                        title={item.numeroInstrumento?.split("/")[1] ?? "—"}
                      >
                        {item.numeroInstrumento?.split("/")[1] ?? "—"}
                      </span>
                    </td>
                    <td className="px-2.5 py-3 text-right font-semibold tabular-nums">
                      <span
                        className="block break-words"
                        title={fmtMoeda(item.financeiro.global)}
                      >
                        {fmtMoeda(item.financeiro.global)}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-border xl:hidden">
        {itens.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <p>Nenhum instrumento bate com esse filtro.</p>
            {onLimparFiltros && (
              <Button
                type="button"
                className="mt-3"
                variant="outline"
                size="sm"
                onClick={onLimparFiltros}
              >
                Limpar filtros
              </Button>
            )}
          </div>
        ) : (
          paginaAtual.map((item) => {
            const equipamentos = item.equipamentos
              .map((e) => e.nome)
              .join(", ");
            const faseInterna = faseMonitoramento.get(item.numero);
            return (
              <article key={item.numero} className="py-4 first:pt-1 last:pb-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold text-muted-foreground">
                      {item.numero}
                    </p>
                    <h3 className="mt-1 break-words text-sm font-semibold leading-snug text-foreground">
                      {item.convenente.nome}
                    </h3>
                  </div>
                  <p className="shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
                    {fmtMoeda(item.financeiro.global)}
                  </p>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {capitalizarNome(item.municipio)}/{item.uf} · CNES{" "}
                  {item.cnes ?? "—"}
                </p>
                <p className="mt-1 break-words text-xs leading-relaxed text-foreground">
                  {equipamentos || "Equipamento não informado"}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {item.situacao && <StatusPill texto={item.situacao} />}
                  {faseInterna && <StatusPill texto={faseInterna} />}
                  <span className="text-[11px] text-muted-foreground">
                    Ano {item.numeroInstrumento?.split("/")[1] ?? "—"}
                  </span>
                </div>
              </article>
            );
          })
        )}
      </div>
      {itens.length > 0 && (
        <Pagination
          page={pagina}
          totalItems={itens.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPagina}
        />
      )}
    </section>
  );
}
