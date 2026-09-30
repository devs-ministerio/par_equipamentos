import { lazy, Suspense, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useMacroGeojson } from "@/hooks/useMacroGeojson";
import { cn } from "@/lib/utils";
import { fetchMacroCoverage } from "@/services/api";
import {
  agruparInstrumentosPorLocal,
  distribuirInstrumentosPorMacrorregiao,
  rotuloMacrorregiao,
} from "@/lib/monitoramento-geografia";
import type { InstrumentoEquipamento } from "@/services/monitoramento-instrumentos";
import { MonitoramentoPainelMapaMacro } from "./monitoramento-painel-mapa-macro";

const MonitoramentoPainelMapaRodoviario = lazy(() =>
  import("./monitoramento-painel-mapa-rodoviario").then((modulo) => ({
    default: modulo.MonitoramentoPainelMapaRodoviario,
  })),
);

export function MonitoramentoPainelGeografia({
  instrumentos,
}: {
  instrumentos: InstrumentoEquipamento[];
}) {
  const geoQuery = useMacroGeojson();
  // Usa a nomenclatura já exibida no Mapa de Cobertura, sem usar nenhum
  // indicador de cobertura para calcular o monitoramento.
  const nomesQuery = useQuery({
    queryKey: ["macro-coverage", "TOMOGRAFO"],
    queryFn: () => fetchMacroCoverage("TOMOGRAFO"),
    staleTime: 5 * 60_000,
  });
  const nomesPorMacro = useMemo(
    () =>
      new Map(
        nomesQuery.data?.macros.map((macro) => [macro.id, macro.nome]) ?? [],
      ),
    [nomesQuery.data],
  );
  const nomeMacro = (id: string) => rotuloMacrorregiao(id, nomesPorMacro);
  const [macroSelecionada, setMacroSelecionada] = useState<string | null>(null);
  const [localSelecionado, setLocalSelecionado] = useState<string | null>(null);
  const distribuicao = useMemo(
    () =>
      geoQuery.data
        ? distribuirInstrumentosPorMacrorregiao(instrumentos, geoQuery.data)
        : null,
    [instrumentos, geoQuery.data],
  );
  const locais = useMemo(
    () => agruparInstrumentosPorLocal(distribuicao?.pontos ?? []),
    [distribuicao],
  );
  const localAtivo = locais.find((local) => local.chave === localSelecionado);
  const ranking = [...(distribuicao?.contagemPorMacro.entries() ?? [])]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const mapeados = distribuicao
    ? distribuicao.pontos.length - distribuicao.foraDasMacros
    : 0;

  function selecionarMacro(macroId: string | null) {
    setMacroSelecionada(macroId);
    setLocalSelecionado(null);
  }

  function selecionarLocal(chave: string | null) {
    setLocalSelecionado(chave);
    if (chave) {
      const local = locais.find((item) => item.chave === chave);
      if (local) setMacroSelecionada(local.macroId);
    }
  }

  return (
    <section
      className="mt-8 border-t border-border pt-6"
      aria-labelledby="geografia-painel-titulo"
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="geografia-painel-titulo"
            className="font-display text-2xl font-semibold tracking-tight"
          >
            Distribuição geográfica
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Instrumentos por macrorregião de saúde, posicionados pelas
            coordenadas do CNES.
          </p>
        </div>
        {distribuicao && (
          <p className="text-sm tabular-nums text-muted-foreground">
            <strong className="text-foreground">{mapeados}</strong> de{" "}
            {instrumentos.length} instrumentos no mapa
          </p>
        )}
      </div>

      {geoQuery.isPending && (
        <div
          role="status"
          aria-label="Carregando mapa"
          className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]"
        >
          <Skeleton className="h-[500px]" />
          <Skeleton className="h-[500px]" />
        </div>
      )}
      {geoQuery.isError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 border border-border bg-card p-5 text-sm"
        >
          <span>Não foi possível carregar a geometria das macrorregiões.</span>
          <button
            type="button"
            onClick={() => geoQuery.refetch()}
            className="inline-flex cursor-pointer items-center gap-1.5 font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <RotateCcw aria-hidden="true" className="size-4" /> Tentar novamente
          </button>
        </div>
      )}
      {distribuicao && geoQuery.data && (
        <>
          <div
            className={cn(
              "grid bg-card lg:grid-cols-[minmax(0,1fr)_300px]",
              !macroSelecionada && "border border-border",
            )}
          >
            <div
              className={cn(
                "min-w-0 p-4 sm:p-5",
                !macroSelecionada &&
                  "border-b border-border lg:border-r lg:border-b-0",
              )}
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-semibold">
                  {macroSelecionada
                    ? `Mapa rodoviário · ${nomeMacro(macroSelecionada)}`
                    : "Macrorregiões de saúde"}
                </h3>
                {macroSelecionada && (
                  <button
                    type="button"
                    onClick={() => selecionarMacro(null)}
                    className="cursor-pointer text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    Voltar ao mapa nacional
                  </button>
                )}
              </div>
              {macroSelecionada ? (
                <>
                  <Suspense
                    fallback={
                      <Skeleton
                        role="status"
                        aria-label="Carregando mapa rodoviário"
                        className="h-[410px] sm:h-[500px]"
                      />
                    }
                  >
                    <MonitoramentoPainelMapaRodoviario
                      geo={geoQuery.data}
                      macroId={macroSelecionada}
                      locais={locais}
                    />
                  </Suspense>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {distribuicao.contagemPorMacro.get(macroSelecionada) ?? 0}{" "}
                      instrumentos nesta macrorregião
                    </span>
                    <span>
                      Marcadores agrupam instrumentos na mesma coordenada CNES
                    </span>
                  </div>
                  {!locais.some(
                    (local) => local.macroId === macroSelecionada,
                  ) && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Nenhum estabelecimento geocodificado neste recorte.
                    </p>
                  )}
                </>
              ) : (
                <MonitoramentoPainelMapaMacro
                  geo={geoQuery.data}
                  nomesPorMacro={nomesPorMacro}
                  contagemPorMacro={distribuicao.contagemPorMacro}
                  locais={locais}
                  macroSelecionada={null}
                  localSelecionado={localAtivo?.chave ?? null}
                  onSelecionarMacro={selecionarMacro}
                  onSelecionarLocal={selecionarLocal}
                />
              )}
            </div>

            <div
              className={cn(
                "flex min-w-0 flex-col p-4 sm:p-5",
                macroSelecionada &&
                  "border-t border-border lg:border-t-0 lg:border-l",
              )}
              aria-live="polite"
            >
              {localAtivo ? (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Local selecionado
                      </p>
                      <h3 className="mt-1 text-base font-semibold">
                        {localAtivo.instrumentos.length === 1
                          ? `CNES ${localAtivo.instrumentos[0].instrumento.cnes ?? "não informado"}`
                          : `${localAtivo.instrumentos.length} instrumentos nesta localização`}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLocalSelecionado(null)}
                      className="cursor-pointer text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      Fechar
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {localAtivo.instrumentos.length}{" "}
                    {localAtivo.instrumentos.length === 1
                      ? "instrumento"
                      : "instrumentos"}{" "}
                    · {nomeMacro(localAtivo.macroId)}
                  </p>
                  <ul className="mt-4 max-h-[430px] divide-y divide-border overflow-y-auto">
                    {localAtivo.instrumentos.map(({ instrumento }) => (
                      <li key={instrumento.id} className="py-3 first:pt-0">
                        <Link
                          to={`/monitoramento-equipamentos/instrumentos/${encodeURIComponent(instrumento.nr_convenio)}`}
                          className="text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {instrumento.nome_convenente}
                        </Link>
                        <p className="mt-1 text-xs text-foreground">
                          {instrumento.equipamento_descricao ??
                            "Equipamento não informado"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {instrumento.nr_convenio} · CNES{" "}
                          {instrumento.cnes ?? "não informado"} ·{" "}
                          {instrumento.fase_atual ?? "Não iniciado"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Técnico:{" "}
                          {instrumento.tecnico_titular ?? "Não atribuído"}
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <h3 className="text-base font-semibold">
                    Maior concentração
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {macroSelecionada
                      ? "Selecione outra região ou volte ao mapa nacional."
                      : "Selecione uma região para abrir o mapa rodoviário."}
                  </p>
                  {ranking.length ? (
                    <ol className="mt-4 divide-y divide-border">
                      {ranking.map(([macroId, quantidade], indice) => (
                        <li key={macroId}>
                          <button
                            type="button"
                            onClick={() =>
                              selecionarMacro(
                                macroSelecionada === macroId ? null : macroId,
                              )
                            }
                            aria-pressed={macroSelecionada === macroId}
                            className="flex w-full cursor-pointer items-center justify-between gap-3 py-3 text-left text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            <span className="min-w-0 truncate">
                              <span className="mr-3 font-data text-xs text-muted-foreground">
                                {String(indice + 1).padStart(2, "0")}
                              </span>
                              {nomeMacro(macroId)}
                            </span>
                            <strong className="font-data tabular-nums">
                              {quantidade}
                            </strong>
                          </button>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-6 text-sm text-muted-foreground">
                      Nenhum instrumento deste recorte está localizado em uma
                      macrorregião.
                    </p>
                  )}
                  <div className="mt-auto grid grid-cols-2 gap-4 border-t border-border pt-6 text-center sm:gap-6">
                    <div className="flex min-h-24 flex-col items-center justify-center">
                      <strong className="font-display text-3xl font-semibold tracking-tight tabular-nums text-primary">
                        {distribuicao.contagemPorMacro.size}
                      </strong>
                      <span className="mt-1 max-w-28 text-xs leading-snug text-muted-foreground">
                        macrorregiões com instrumentos
                      </span>
                    </div>
                    <div className="flex min-h-24 flex-col items-center justify-center border-l border-border pl-4 sm:pl-6">
                      <strong className="font-display text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                        {locais.length}
                      </strong>
                      <span className="mt-1 max-w-28 text-xs leading-snug text-muted-foreground">
                        locais distintos
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          {distribuicao.semCoordenadas > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {distribuicao.semCoordenadas} sem coordenadas no CNES.
            </p>
          )}
        </>
      )}
    </section>
  );
}
