import { useState } from "react";
import { Pagination } from "@/components/common/pagination";
import { Button } from "@/components/ui/button";
import { estiloCard, StatusPill } from "@/components/features/monitoramento-ui";
import { fmtData, fmtMoeda } from "@/lib/monitoramento-format";
import { situacaoDeFato } from "@/lib/proposta-status";
import { capitalizarNome } from "@/utils/texto";
import type { PropostaCandidata } from "@/services/propostas-candidatas";

const PAGE_SIZE = 20;

/** Tabela de prévia de "Linhas de financiamento" (propostas candidatas) do
 * relatório de Instrumentos e Repasse -- 1 componente reaproveitado nas 2
 * seções (Confirmada/Parceria e Em tramitação/Proposta, empilhadas uma
 * abaixo da outra, ver `estagioDeFato`), só troca `titulo`/`itens`. Mesmo
 * padrão de layout/formatação da tabela de Instrumentos Monitorados
 * (`monitoramento-overview-lista.tsx`): card + `<table>` nativa +
 * paginação (Seção 5 da constituição: numérico à direita). Larguras em
 * **porcentagem** (`table-fixed` + `<colgroup>`), mesma técnica de
 * `relatorio-instrumentos-tabela.tsx` -- nunca precisa de rolagem
 * horizontal (pedido do usuário 2026-09-26). Município também passa por
 * `capitalizarNome` (mesma normalização da tabela de Convênios -- sem
 * isso "SÃO PAULO" apareceria diferente de "São Paulo" na tela ao lado).
 * Proponente quebra texto (`whitespace-normal break-words`) em vez de
 * cortar com reticências (mesma correção 2026-09-26 da tabela de
 * Convênios) -- é o campo mais longo aqui (nome de instituição). */
export function RelatorioPropostasTabela({
  titulo,
  itens,
  descricao,
  onLimparFiltros,
}: {
  titulo: string;
  itens: PropostaCandidata[];
  descricao: string;
  onLimparFiltros?: () => void;
}) {
  const [pagina, setPagina] = useState(1);
  const paginaAtual = itens.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE);

  return (
    <section className={estiloCard} aria-label={titulo}>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-[10px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
            <span className="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground">
              {titulo === "Parcerias confirmadas" ? "03" : "04"}
            </span>
            Linhas de financiamento
          </p>
          <h2 className="mt-2 font-display text-xl font-bold tracking-[-0.035em] text-foreground sm:text-2xl">
            {titulo}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {descricao} · {itens.length}{" "}
            {itens.length === 1 ? "registro" : "registros"}
          </p>
        </div>
      </header>
      <div className="hidden overflow-hidden xl:block">
        <table className="w-full table-fixed border-collapse text-[12.5px]">
          <colgroup>
            <col style={{ width: "11%" }} />
            <col style={{ width: "27%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "19%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "7%" }} />
          </colgroup>
          <thead>
            <tr className="bg-muted/65 text-left text-[10px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
              <th className="px-2.5 py-3">Proposta/Parceria</th>
              <th className="px-2.5 py-3">Proponente</th>
              <th className="px-2.5 py-3">Município/UF</th>
              <th className="px-2.5 py-3">Programa</th>
              <th className="px-2.5 py-3">Situação</th>
              <th className="px-2.5 py-3 text-right">Valor global</th>
              <th className="px-2.5 py-3 text-right">Data</th>
            </tr>
          </thead>
          <tbody>
            {itens.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-2 py-3.5 text-center text-muted-foreground italic"
                >
                  <div className="flex flex-col items-center gap-2 py-3">
                    <span>
                      Nenhuma linha de financiamento bate com esse filtro.
                    </span>
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
              paginaAtual.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-border transition-colors duration-150 hover:bg-muted/35"
                >
                  <td
                    className="break-all px-2.5 py-3 font-semibold"
                    title={String(item.cd_parceria ?? item.id_proposta)}
                  >
                    {item.cd_parceria ?? item.id_proposta}
                  </td>
                  <td className="px-2.5 py-3 break-words whitespace-normal font-medium">
                    {item.nm_proponente}
                  </td>
                  <td
                    className="truncate px-2.5 py-3"
                    title={
                      item.municipio
                        ? `${capitalizarNome(item.municipio)}/${item.uf ?? "—"}`
                        : undefined
                    }
                  >
                    {item.municipio ? capitalizarNome(item.municipio) : "—"}/
                    {item.uf ?? "—"}
                  </td>
                  <td className="px-2.5 py-3 break-words whitespace-normal">
                    {item.nm_programa}
                  </td>
                  <td
                    className="truncate px-2.5 py-3"
                    title={situacaoDeFato(item) ?? undefined}
                  >
                    {situacaoDeFato(item) ? (
                      <StatusPill texto={situacaoDeFato(item)} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="overflow-hidden px-2.5 py-3 text-right font-semibold tabular-nums">
                    <span
                      className="block truncate"
                      title={fmtMoeda(item.vl_global_proposta)}
                    >
                      {fmtMoeda(item.vl_global_proposta)}
                    </span>
                  </td>
                  <td className="overflow-hidden px-2.5 py-3 text-right">
                    <span
                      className="block truncate"
                      title={fmtData(item.data_proposta)}
                    >
                      {fmtData(item.data_proposta)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-border xl:hidden">
        {itens.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <p>Nenhuma linha de financiamento bate com esse filtro.</p>
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
          paginaAtual.map((item) => (
            <article key={item.id} className="py-4 first:pt-1 last:pb-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    {item.cd_parceria ?? item.id_proposta}
                  </p>
                  <h3 className="mt-1 break-words text-sm font-semibold leading-snug text-foreground">
                    {item.nm_proponente}
                  </h3>
                </div>
                <p className="shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
                  {fmtMoeda(item.vl_global_proposta)}
                </p>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {item.municipio
                  ? capitalizarNome(item.municipio)
                  : "Município não informado"}
                /{item.uf ?? "—"} · {fmtData(item.data_proposta)}
              </p>
              <p className="mt-1 break-words text-xs leading-relaxed text-foreground">
                {item.nm_programa}
              </p>
              <div className="mt-3">
                {situacaoDeFato(item) ? (
                  <StatusPill texto={situacaoDeFato(item)} />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Situação não informada
                  </span>
                )}
              </div>
            </article>
          ))
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
