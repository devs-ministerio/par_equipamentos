import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { LocalInstrumentos } from "@/lib/monitoramento-geografia";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import { MonitoramentoPainelMapaMacro } from "./monitoramento-painel-mapa-macro";

const MonitoramentoPainelMapaRodoviario = lazy(() =>
  import("./monitoramento-painel-mapa-rodoviario").then((modulo) => ({
    default: modulo.MonitoramentoPainelMapaRodoviario,
  })),
);

interface PropsColunaMapa {
  geo: FeatureCollection<Geometry, GeoJsonProperties>;
  contagemPorMacro: Map<string, number>;
  macroSelecionada: string | null;
  localSelecionado: string | null;
  locais: LocalInstrumentos[];
  nomesPorMacro: Map<string, string>;
  nomeMacro: (id: string) => string;
  equipamentosPorNumero?: ReadonlyMap<string, string[]>;
  selecionarMacro: (id: string | null) => void;
  selecionarLocal: (chave: string | null) => void;
}

/** Coluna do mapa: visão nacional ou mapa rodoviário da macrorregião. */
export function MonitoramentoPainelColunaMapa({
  geo,
  contagemPorMacro,
  macroSelecionada,
  localSelecionado,
  locais,
  nomesPorMacro,
  nomeMacro,
  equipamentosPorNumero,
  selecionarMacro,
  selecionarLocal,
}: PropsColunaMapa) {
  return (
    <div
      className={cn(
        "min-w-0 p-4 sm:p-5",
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
              geo={geo}
              macroId={macroSelecionada}
              locais={locais}
              equipamentosPorNumero={equipamentosPorNumero}
            />
          </Suspense>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {contagemPorMacro.get(macroSelecionada) ?? 0} instrumentos nesta
              macrorregião
            </span>
            <span>
              Marcadores agrupam instrumentos na mesma coordenada CNES
            </span>
          </div>
          {!locais.some((local) => local.macroId === macroSelecionada) && (
            <p className="mt-3 text-xs text-muted-foreground">
              Nenhum estabelecimento geocodificado neste recorte.
            </p>
          )}
        </>
      ) : (
        <MonitoramentoPainelMapaMacro
          geo={geo}
          nomesPorMacro={nomesPorMacro}
          contagemPorMacro={contagemPorMacro}
          locais={locais}
          macroSelecionada={null}
          localSelecionado={localSelecionado}
          onSelecionarMacro={selecionarMacro}
          onSelecionarLocal={selecionarLocal}
        />
      )}
    </div>
  );
}
