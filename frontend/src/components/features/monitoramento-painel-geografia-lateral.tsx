import { LinkDetalheInstrumento } from "./link-detalhe-instrumento";
import type { LocalInstrumentos } from "@/lib/monitoramento-geografia";

interface PropsLateral {
  localAtivo: LocalInstrumentos | undefined;
  ranking: Array<[string, number]>;
  macroSelecionada: string | null;
  macrorregioesComInstrumentos: number;
  municipios: number;
  equipamentosPorNumero?: ReadonlyMap<string, string[]>;
  nomeMacro: (id: string) => string;
  nomeMacroRanking: (id: string) => string;
  selecionarMacro: (id: string | null) => void;
  fecharLocal: () => void;
}

/** Coluna lateral do mapa: local selecionado ou ranking de macrorregiões. */
export function MonitoramentoPainelGeografiaLateral({
  localAtivo,
  ranking,
  macroSelecionada,
  macrorregioesComInstrumentos,
  municipios,
  equipamentosPorNumero,
  nomeMacro,
  nomeMacroRanking,
  selecionarMacro,
  fecharLocal,
}: PropsLateral) {
  return (
    <>
      {localAtivo ? (
        <>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Local selecionado</p>
              <h3 className="mt-1 text-base font-semibold">
                {localAtivo.instrumentos.length === 1
                  ? `CNES ${localAtivo.instrumentos[0].instrumento.cnes ?? "não informado"}`
                  : `${localAtivo.instrumentos.length} instrumentos nesta localização`}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => fecharLocal()}
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
                <LinkDetalheInstrumento
                  nrConvenio={instrumento.nr_convenio}
                  className="text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {instrumento.nome_convenente}
                </LinkDetalheInstrumento>
                <p className="mt-1 text-xs text-foreground">
                  {equipamentosPorNumero?.get(instrumento.nr_convenio)?.length
                    ? equipamentosPorNumero
                        .get(instrumento.nr_convenio)
                        ?.join(", ")
                    : (instrumento.equipamento_descricao ??
                      "Equipamento não informado")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {instrumento.nr_convenio} · CNES{" "}
                  {instrumento.cnes ?? "não informado"} ·{" "}
                  {instrumento.fase_atual ?? "Acompanhamento iniciado"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Técnico: {instrumento.tecnico_titular ?? "Não atribuído"}
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <h3 className="text-base font-semibold">Maior concentração</h3>
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
                      {nomeMacroRanking(macroId)}
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
                {macrorregioesComInstrumentos}
              </strong>
              <span className="mt-1 max-w-28 text-xs leading-snug text-muted-foreground">
                macrorregiões com instrumentos
              </span>
            </div>
            <div className="flex min-h-24 flex-col items-center justify-center border-l border-border pl-4 sm:pl-6">
              <strong className="font-display text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                {municipios}
              </strong>
              <span className="mt-1 max-w-28 text-xs leading-snug text-muted-foreground">
                municípios
              </span>
            </div>
          </div>
        </>
      )}
    </>
  );
}
