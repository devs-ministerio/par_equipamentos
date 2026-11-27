import { useMemo, useState } from "react";
import { MonitoramentoPainelGeografiaLateral } from "./monitoramento-painel-geografia-lateral";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useMacroGeojson } from "@/hooks/useMacroGeojson";
import { cn } from "@/lib/utils";
import { chaveMunicipio } from "@/lib/municipio-filtro";
import { fetchMacroCoverage } from "@/services/api";
import {
  agruparInstrumentosPorLocal,
  distribuirInstrumentosPorMacrorregiao,
  rotuloMacrorregiao,
} from "@/lib/monitoramento-geografia";
import type { InstrumentoEquipamento } from "@/services/monitoramento-instrumentos";
import { MonitoramentoPainelColunaMapa } from "./monitoramento-painel-coluna-mapa";

export function MonitoramentoPainelGeografia({
  instrumentos,
  equipamentosPorNumero,
}: {
  instrumentos: InstrumentoEquipamento[];
  /** Rótulos canônicos por instrumento (marcadores); sem eles, cai na descrição planejada. */
  equipamentosPorNumero?: ReadonlyMap<string, string[]>;
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
  const ufPorMacro = useMemo(
    () =>
      new Map(
        nomesQuery.data?.macros.map((macro) => [macro.id, macro.uf]) ?? [],
      ),
    [nomesQuery.data],
  );
  const nomeMacro = (id: string) => rotuloMacrorregiao(id, nomesPorMacro);
  // No ranking, UF e código distinguem denominações repetidas (ex.: "Metropolitana").
  const nomeMacroRanking = (id: string) =>
    `${nomeMacro(id)}${ufPorMacro.get(id) ? ` (${ufPorMacro.get(id)})` : ""} · ${id}`;
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
  // Reconcilia a seleção local com o recorte: se uma troca de filtro deixar a
  // macro escolhida sem nenhum instrumento, volta à visão nacional e avisa
  // (zero só vale quando a pessoa escolhe a macro dentro do recorte atual).
  const assinaturaRecorte = instrumentos.map((item) => item.id).join(",");
  const [assinaturaAnterior, setAssinaturaAnterior] =
    useState(assinaturaRecorte);
  const [avisoMacro, setAvisoMacro] = useState<string | null>(null);
  if (assinaturaRecorte !== assinaturaAnterior) {
    setAssinaturaAnterior(assinaturaRecorte);
    setAvisoMacro(null);
    if (
      distribuicao &&
      (macroSelecionada || localSelecionado) &&
      !(macroSelecionada && distribuicao.contagemPorMacro.get(macroSelecionada))
    ) {
      if (macroSelecionada)
        setAvisoMacro(
          `A macrorregião ${nomeMacro(macroSelecionada)} não tem instrumentos no recorte atual; o mapa voltou à visão nacional.`,
        );
      setMacroSelecionada(null);
      setLocalSelecionado(null);
    }
  }
  const municipios = new Set(
    (distribuicao?.pontos ?? []).map(
      (p) =>
        `${p.instrumento.uf ?? ""}:${chaveMunicipio(p.instrumento.municipio ?? "")}`,
    ),
  ).size;
  const localAtivo = locais.find((local) => local.chave === localSelecionado);
  const ranking = [...(distribuicao?.contagemPorMacro.entries() ?? [])]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  function selecionarMacro(macroId: string | null) {
    setAvisoMacro(null);
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
    <div className="space-y-4">
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
              "grid overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[var(--shadow-soft)] lg:grid-cols-[minmax(0,1fr)_300px]",
            )}
          >
            <MonitoramentoPainelColunaMapa
              geo={geoQuery.data}
              contagemPorMacro={distribuicao.contagemPorMacro}
              macroSelecionada={macroSelecionada}
              localSelecionado={localAtivo?.chave ?? null}
              locais={locais}
              nomesPorMacro={nomesPorMacro}
              nomeMacro={nomeMacro}
              equipamentosPorNumero={equipamentosPorNumero}
              selecionarMacro={selecionarMacro}
              selecionarLocal={selecionarLocal}
            />
            <div
              className={cn("flex min-w-0 flex-col p-4 sm:p-5")}
              aria-live="polite"
            >
              <MonitoramentoPainelGeografiaLateral
                localAtivo={localAtivo}
                ranking={ranking}
                macroSelecionada={macroSelecionada}
                macrorregioesComInstrumentos={
                  distribuicao.contagemPorMacro.size
                }
                municipios={municipios}
                equipamentosPorNumero={equipamentosPorNumero}
                nomeMacro={nomeMacro}
                nomeMacroRanking={nomeMacroRanking}
                selecionarMacro={selecionarMacro}
                fecharLocal={() => setLocalSelecionado(null)}
              />
            </div>
          </div>
          {avisoMacro && (
            <p role="status" className="mt-3 text-xs text-muted-foreground">
              {avisoMacro}
            </p>
          )}
          {(distribuicao.semCoordenadas > 0 ||
            distribuicao.foraDasMacros > 0) && (
            <p className="mt-3 text-xs text-muted-foreground">
              Fora do mapa: {distribuicao.semCoordenadas} sem CNES vinculado ou
              sem coordenadas no CNES · {distribuicao.foraDasMacros} com
              coordenadas que não caem em nenhuma macrorregião da geometria.
            </p>
          )}
        </>
      )}
    </div>
  );
}
