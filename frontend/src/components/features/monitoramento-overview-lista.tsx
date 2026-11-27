import { LinkDetalheInstrumento } from "./link-detalhe-instrumento";
import { Pagination } from "@/components/common/pagination";
import { Badge } from "@/components/ui/badge";
import { estiloCard, StatusPill } from "@/components/features/monitoramento-ui";
import type { InstrumentoMonitoramentoFiltravel } from "@/hooks/use-monitoramento-interno-filtros";

export type InstrumentoResumo = InstrumentoMonitoramentoFiltravel;
const PAGE_SIZE = 20;
const COLUNAS = [
  ["Instrumentos/Programas", "16%"],
  ["Convenente", "24%"],
  ["UF/Município", "14%"],
  ["Prestação de contas", "18%"],
  ["Técnico titular", "14%"],
  ["Fase", "14%"],
] as const;
const VAZIO = "Nenhum instrumento bate com esse filtro.";

function Identificacao({ item }: { item: InstrumentoResumo }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 xl:flex-col xl:items-start">
      <LinkDetalheInstrumento
        nrConvenio={item.nr_convenio}
        className="inline-flex min-h-11 items-center break-all font-mono text-xs font-semibold text-primary hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary xl:min-h-0"
      >
        {item.nr_convenio}
      </LinkDetalheInstrumento>
      <Badge variant="secondary">{item.tipo_contratacao ?? "Convênio"}</Badge>
    </div>
  );
}

function Titular({ nome }: { nome: InstrumentoResumo["tecnico_titular"] }) {
  return nome ?? <StatusPill texto="Pendente" />;
}

export function MonitoramentoOverviewLista({
  instrumentos,
  pagina,
  onPagina,
}: {
  instrumentos: InstrumentoResumo[];
  pagina: number;
  onPagina: (pagina: number) => void;
}) {
  // Uma recaptura pode reduzir o mesmo recorte sem alterar sua URL.
  const paginaEfetiva = Math.max(
    1,
    Math.min(pagina, Math.ceil(instrumentos.length / PAGE_SIZE) || 1),
  );
  const inicio = (paginaEfetiva - 1) * PAGE_SIZE;
  const paginaAtual = instrumentos.slice(inicio, inicio + PAGE_SIZE);

  return (
    <section
      className={estiloCard}
      aria-labelledby="instrumentos-monitorados-titulo"
    >
      <header className="mb-4 border-b border-border pb-4">
        <h2
          id="instrumentos-monitorados-titulo"
          className="font-display text-xl font-bold tracking-[-0.035em] text-foreground sm:text-2xl"
        >
          Instrumentos monitorados (
          {instrumentos.length.toLocaleString("pt-BR")})
        </h2>
      </header>
      <div className="hidden overflow-hidden rounded-xl border border-border xl:block">
        <table className="w-full table-fixed border-collapse text-[12.5px]">
          <colgroup>
            {COLUNAS.map(([rotulo, largura]) => (
              <col key={rotulo} style={{ width: largura }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-muted/65">
              {COLUNAS.map(([rotulo]) => (
                <th
                  key={rotulo}
                  scope="col"
                  className="px-3 py-3 text-left text-[10px] font-bold tracking-[0.08em] text-muted-foreground uppercase"
                >
                  {rotulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginaAtual.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUNAS.length}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  {VAZIO}
                </td>
              </tr>
            ) : (
              paginaAtual.map((item) => (
                <tr
                  key={item.nr_convenio}
                  className="transition-colors hover:bg-muted/35"
                >
                  <td className="px-3 py-3.5">
                    <Identificacao item={item} />
                  </td>
                  <td className="px-3 py-3.5 break-words font-semibold leading-snug">
                    {item.nome_convenente}
                  </td>
                  <td className="px-3 py-3.5 break-words text-muted-foreground">
                    {item.uf}/{item.municipio}
                  </td>
                  <td className="px-3 py-3.5 break-words">
                    <StatusPill texto={item.situacao_prestacao_contas} />
                  </td>
                  <td className="px-3 py-3.5 break-words">
                    <Titular nome={item.tecnico_titular} />
                  </td>
                  <td className="px-3 py-3.5 break-words">
                    <StatusPill texto={item.fase_atual} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div
        className="divide-y divide-border xl:hidden"
        aria-label="Instrumentos monitorados"
      >
        {paginaAtual.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {VAZIO}
          </p>
        ) : (
          paginaAtual.map((item) => (
            <article key={item.nr_convenio} className="py-4 first:pt-0">
              <Identificacao item={item} />
              <h3 className="break-words text-sm font-semibold leading-snug">
                {item.nome_convenente}
              </h3>
              <p className="mt-2 text-xs text-muted-foreground">
                {item.municipio}/{item.uf}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div className="min-w-0">
                  <dt className="mb-1 text-muted-foreground">Fase</dt>
                  <dd>
                    <StatusPill texto={item.fase_atual} />
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="mb-1 text-muted-foreground">
                    Técnico titular
                  </dt>
                  <dd className="break-words font-medium">
                    <Titular nome={item.tecnico_titular} />
                  </dd>
                </div>
                <div className="col-span-2 min-w-0">
                  <dt className="mb-1 text-muted-foreground">
                    Prestação de contas
                  </dt>
                  <dd>
                    <StatusPill texto={item.situacao_prestacao_contas} />
                  </dd>
                </div>
              </dl>
            </article>
          ))
        )}
      </div>
      {instrumentos.length > 0 && (
        <Pagination
          page={paginaEfetiva}
          totalItems={instrumentos.length}
          pageSize={PAGE_SIZE}
          onPageChange={onPagina}
          mobileStacked
        />
      )}
    </section>
  );
}
