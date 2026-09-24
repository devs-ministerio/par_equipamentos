import { lazy, Suspense, useMemo } from "react";
import type { FeatureCollection, Geometry, GeoJsonProperties } from "geojson";
import type { PontoEstabelecimento } from "@/components/features/macro-map";
import { FilterWorkspace } from "@/components/common/filter-workspace";
import { SingleSelectFilter } from "@/components/common/single-select-filter";
import { RAIO_BUSCA_MUNICIPIO_KM } from "@/hooks/useEstabelecimentosMapa";
import type { Macrorregiao, NivelCoberturaRow } from "@/types/domain";

// Leaflet (~150KB) so entra no bundle quando essa secao realmente monta --
// mesmo padrao ja usado pro jsPDF/ExcelJS em utils/exportPdf.ts/exportXlsx.ts
// (lib pesada, usada numa parte especifica da UI, carregada sob demanda em
// vez de inflar o bundle principal que TODA pagina paga, mesmo quem nunca
// abre o Mapa). Import direto do módulo (não do barrel) -- lazy() precisa
// de um import() dedicado pro code-splitting funcionar.
const MacroMapReal = lazy(() =>
  import("@/components/features/macro-map-real").then((m) => ({
    default: m.MacroMapReal,
  })),
);

/** Card compacto de resumo (Total de equipamentos / Distância / Município
 * mais próximo / População SUS) mostrado acima do filtro de Macro/
 * Município -- reflete a granularidade mais fina já selecionada (município,
 * se houver; senão a macro). */
function CardInfo({
  label,
  valor,
  cor,
}: {
  label: string;
  valor: string;
  cor?: string;
}) {
  return (
    <div className="min-w-[150px] flex-[1_1_150px] rounded-lg border border-border bg-muted px-3.5 py-2.5">
      <div className="overflow-hidden text-[10.5px] font-bold tracking-[0.03em] text-ellipsis whitespace-nowrap text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={`mt-[3px] overflow-hidden text-[17px] font-bold text-ellipsis whitespace-nowrap ${cor ? "" : "text-foreground"}`}
        style={cor ? { color: cor } : undefined}
        title={valor}
      >
        {valor}
      </div>
    </div>
  );
}

interface Props {
  geo: FeatureCollection<Geometry, GeoJsonProperties> | null;
  familia: string;
  macros: Macrorregiao[];
  selectedMacroId: string | null;
  setSelectedMacroId: (id: string | null) => void;
  municipiosMacro: NivelCoberturaRow[];
  selectedMunicipioId: string | null;
  setSelectedMunicipioId: (id: string | null) => void;
  municipioSelecionado: NivelCoberturaRow | undefined;
  infoSelecionado: { pop: number; ofertaTotal: number } | undefined;
  distanciaMaisProximaKm: number | null;
  nomeEquipamentoMaisProximo: string | null;
  pontosMacro: PontoEstabelecimento[];
  totalEstabelecimentosNoRaio: number | null;
  contornoMunicipio: GeoJSON.Feature | null;
  erroContornoMunicipio: Error | null;
}

/**
 * Seção "Mapa Rodoviário" (filtro Macro/Município, cards de resumo e o mapa
 * de ruas de verdade via `MacroMapReal`) -- extraída de `MapaPage` só pra
 * manter o arquivo da página dentro do limite de ~200 linhas (Seção 6 da
 * constituição), sem mudança de comportamento.
 */
export function MapaRodoviarioSecao({
  geo,
  familia,
  macros,
  selectedMacroId,
  setSelectedMacroId,
  municipiosMacro,
  selectedMunicipioId,
  setSelectedMunicipioId,
  municipioSelecionado,
  infoSelecionado,
  distanciaMaisProximaKm,
  nomeEquipamentoMaisProximo,
  pontosMacro,
  totalEstabelecimentosNoRaio,
  contornoMunicipio,
  erroContornoMunicipio,
}: Props) {
  // Objeto estavel (mesma referencia entre renders iguais) -- MacroMapReal
  // redesenha o mapa (Leaflet) sempre que este prop muda de referencia; sem
  // memoizar, qualquer re-render nao relacionado recriava o objeto e
  // disparava um redesenho inteiro do mapa a toa.
  const centroMunicipio = useMemo(
    () =>
      municipioSelecionado?.latitude != null &&
      municipioSelecionado.longitude != null
        ? {
            lat: municipioSelecionado.latitude,
            lon: municipioSelecionado.longitude,
            nome: municipioSelecionado.nome,
          }
        : undefined,
    [municipioSelecionado],
  );

  return (
    <div className="mt-4 rounded-lg bg-card px-4.5 py-4">
      <div className="text-sm font-semibold">
        Equipamentos — Mapa Rodoviário
      </div>

      {infoSelecionado && (
        <div className="mt-3 flex flex-wrap gap-2.5">
          <CardInfo
            label="Total de equipamentos"
            valor={infoSelecionado.ofertaTotal.toLocaleString("pt-BR")}
          />
          {/* Cor so pro TOMOGRAFO (unica familia com criterio normativo de
              raio, 75km -- Caderno 1 SUS 2017): dentro = verde/bom, fora =
              vermelho/ruim. Pras demais familias o valor ainda e mostrado,
              so que na cor default do CardInfo. */}
          <CardInfo
            label="Distância mais próxima"
            valor={
              distanciaMaisProximaKm != null
                ? `${distanciaMaisProximaKm.toFixed(0)} km`
                : "—"
            }
            cor={
              familia === "TOMOGRAFO" && distanciaMaisProximaKm != null
                ? distanciaMaisProximaKm <= 75
                  ? "var(--success)"
                  : "var(--destructive)"
                : undefined
            }
          />
          <CardInfo
            label="Equipamento mais próximo"
            valor={nomeEquipamentoMaisProximo ?? "—"}
          />
          <CardInfo
            label="População SUS"
            valor={infoSelecionado.pop.toLocaleString("pt-BR")}
          />
        </div>
      )}

      <FilterWorkspace
        className="mt-3.5"
        hasAnyFilter={Boolean(selectedMacroId || selectedMunicipioId)}
        onClear={() => {
          setSelectedMacroId(null);
          setSelectedMunicipioId(null);
        }}
      >
        <SingleSelectFilter
          placeholder="Selecione uma macrorregião"
          value={selectedMacroId}
          onChange={setSelectedMacroId}
          options={[...macros]
            .sort(
              (a, b) =>
                a.uf.localeCompare(b.uf) || a.nome.localeCompare(b.nome),
            )
            .map((m) => ({
              value: m.id,
              label: `${m.uf} · ${m.id} · ${m.nome}`,
            }))}
          minWidth={260}
        />
        <SingleSelectFilter
          placeholder="Toda a macrorregião"
          value={selectedMunicipioId}
          onChange={setSelectedMunicipioId}
          clearLabel="Toda a macrorregião"
          options={[...municipiosMacro]
            .sort((a, b) => a.nome.localeCompare(b.nome))
            .map((m) => ({ value: m.chave, label: `${m.nome} (${m.uf})` }))}
          minWidth={220}
        />
      </FilterWorkspace>

      {municipioSelecionado && (
        <div className="mt-2.5 text-[12.5px] text-muted-foreground">
          Mostrando{" "}
          {totalEstabelecimentosNoRaio != null &&
          totalEstabelecimentosNoRaio > pontosMacro.length
            ? `os ${pontosMacro.length} estabelecimentos mais próximos (de ${totalEstabelecimentosNoRaio} dentro de ${RAIO_BUSCA_MUNICIPIO_KM} km)`
            : `estabelecimentos num raio de ${RAIO_BUSCA_MUNICIPIO_KM} km`}{" "}
          de <strong>{municipioSelecionado.nome}</strong>.
        </div>
      )}

      {geo &&
        (selectedMacroId || municipioSelecionado) &&
        pontosMacro.length === 0 && (
          <div className="mt-3 text-[12.5px] text-muted-foreground">
            Nenhum estabelecimento geocodificado encontrado nesse recorte.
          </div>
        )}

      {geo && (selectedMacroId || municipioSelecionado) && (
        <>
          <div className="mt-3">
            <Suspense
              fallback={
                <div
                  role="status"
                  className="flex h-[560px] items-center justify-center text-muted-foreground"
                >
                  Carregando mapa...
                </div>
              }
            >
              <MacroMapReal
                geo={geo}
                macroId={selectedMacroId ?? undefined}
                pontos={pontosMacro}
                contornoMunicipio={contornoMunicipio}
                centro={centroMunicipio}
              />
            </Suspense>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3.5">
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                className="inline-block h-2 w-2 rounded-full bg-foreground"
                aria-hidden="true"
              />
              estabelecimento (tamanho = qtd. de equipamentos)
            </span>
            {municipioSelecionado && (
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full border-[1.5px] border-card bg-destructive"
                  aria-hidden="true"
                />
                município selecionado
              </span>
            )}
            {municipioSelecionado && (
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span
                  className="inline-block h-2 w-3 rounded-[3px] border-[1.5px] border-dashed border-destructive"
                  aria-hidden="true"
                />
                {erroContornoMunicipio
                  ? "contorno indisponível"
                  : contornoMunicipio
                    ? "contorno do município selecionado"
                    : "buscando contorno do município..."}
              </span>
            )}
          </div>
          {erroContornoMunicipio && (
            <p className="mt-2 text-xs text-warning" role="status">
              Não foi possível carregar o contorno do município selecionado.
            </p>
          )}
        </>
      )}
    </div>
  );
}
