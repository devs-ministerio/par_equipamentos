import type { Dispatch, SetStateAction } from "react";
import { MetricStrip } from "@/components/common/metric-strip";
import { FilterWorkspace } from "@/components/common/filter-workspace";
import {
  MultiSelectFilter,
  type FilterOption,
} from "@/components/common/multi-select-filter";
import { CoberturaTable } from "@/components/features/cobertura-table";
import { EstabelecimentoTable } from "@/components/features/estabelecimento-table";
import { InfoIcon } from "@/components/features/info-icon";
import { NivelCoberturaTable } from "@/components/features/nivel-cobertura-table";
import { StatusFilterButtons } from "@/components/features/status-filter-buttons";
import { REGIOES } from "@/data/constants";
import type {
  CoberturaRow,
  Macrorregiao,
  StatusCobertura,
} from "@/types/domain";

type Nivel = "macro" | "regiaoSaude" | "municipio";
type Filtros = {
  regioes: string[];
  ufs: string[];
  macros: string[];
  regioesSaude: string[];
  municipios: string[];
  cnes: string[];
};

export function DashboardConteudo({
  familia,
  macros,
  rows,
  filtros,
  options,
  hasAnyFilter,
  limparFiltros,
  totais,
  totalEquipMacro,
  totalEquipGeralMacro,
  municipiosHipo,
  regioesSaudeHipo,
  regioesSaudeTotal,
  macrosHipo,
  nivelTabela,
  nivelForcado,
  setStatusFiltro,
  statusFiltro,
  verHipo,
  sairDoHipo,
  setFiltroRegioes,
  setFiltroUfs,
  setFiltroMacros,
  setFiltroRegioesSaude,
  setFiltroMunicipios,
  setFiltroCnes,
}: {
  familia: string;
  macros: Macrorregiao[];
  rows: CoberturaRow[];
  filtros: Filtros;
  options: {
    uf: FilterOption[];
    macro: FilterOption[];
    regiaoSaude: FilterOption[];
    municipio: FilterOption[];
    cnes: FilterOption[];
  };
  hasAnyFilter: boolean;
  limparFiltros: () => void;
  totais: { existingQty: number; availableQty: number } | null;
  totalEquipMacro: number;
  totalEquipGeralMacro: number;
  municipiosHipo: number | null;
  regioesSaudeHipo: number | null;
  regioesSaudeTotal: number | null;
  macrosHipo: number;
  nivelTabela: Nivel;
  nivelForcado: Nivel | null;
  statusFiltro: Set<StatusCobertura>;
  setStatusFiltro: Dispatch<SetStateAction<Set<StatusCobertura>>>;
  verHipo: (nivel: Nivel) => void;
  sairDoHipo: () => void;
  setFiltroRegioes: (v: string[]) => void;
  setFiltroUfs: (v: string[]) => void;
  setFiltroMacros: (v: string[]) => void;
  setFiltroRegioesSaude: (v: string[]) => void;
  setFiltroMunicipios: (v: string[]) => void;
  setFiltroCnes: (v: string[]) => void;
}) {
  return (
    <>
      <FilterWorkspace hasAnyFilter={hasAnyFilter} onClear={limparFiltros}>
        <MultiSelectFilter
          placeholder="CNES"
          options={options.cnes}
          selected={filtros.cnes}
          onChange={setFiltroCnes}
          appearance="standard"
        />
        <MultiSelectFilter
          placeholder="Região"
          options={REGIOES.map((value) => ({ value, label: value }))}
          selected={filtros.regioes}
          onChange={(v) => {
            setFiltroRegioes(v);
            setFiltroUfs([]);
            setFiltroMacros([]);
            setFiltroRegioesSaude([]);
            setFiltroMunicipios([]);
            setFiltroCnes([]);
          }}
          appearance="standard"
        />
        <MultiSelectFilter
          placeholder="Estado (UF)"
          options={options.uf}
          selected={filtros.ufs}
          onChange={(v) => {
            setFiltroUfs(v);
            setFiltroMacros([]);
            setFiltroRegioesSaude([]);
            setFiltroMunicipios([]);
            setFiltroCnes([]);
          }}
          appearance="standard"
        />
        <MultiSelectFilter
          placeholder="Macrorregião de Saúde"
          options={options.macro}
          selected={filtros.macros}
          onChange={(v) => {
            setFiltroMacros(v);
            setFiltroRegioesSaude([]);
            setFiltroMunicipios([]);
            setFiltroCnes([]);
          }}
          appearance="standard"
        />
        <MultiSelectFilter
          placeholder="Região de Saúde"
          options={options.regiaoSaude}
          selected={filtros.regioesSaude}
          onChange={(v) => {
            setFiltroRegioesSaude(v);
            setFiltroMunicipios([]);
            setFiltroCnes([]);
          }}
          appearance="standard"
        />
        <MultiSelectFilter
          placeholder="Município"
          options={options.municipio}
          selected={filtros.municipios}
          onChange={(v) => {
            setFiltroMunicipios(v);
            setFiltroCnes([]);
          }}
          appearance="standard"
        />
      </FilterWorkspace>
      <MetricStrip
        compactMobile
        items={[
          {
            key: "total",
            label: "Total de Equipamentos",
            value: totais?.existingQty ?? totalEquipGeralMacro,
            variant: "primary",
            info: (
              <InfoIcon>
                Inclui equipamentos privados. Só o card ao lado (em uso e SUS)
                entra no cálculo de cobertura.
              </InfoIcon>
            ),
          },
          {
            key: "total-sus",
            label: "Total de Equipamentos em uso SUS",
            value: totais?.availableQty ?? totalEquipMacro,
            variant: "primary",
          },
          {
            key: "municipios-hipo",
            label: "Municípios Hipossuficientes",
            value: municipiosHipo ?? "—",
            variant: "destructive",
            onClick: () => verHipo("municipio"),
            ativo: nivelForcado === "municipio",
            info: (
              <InfoIcon>
                Municípios com mais de 100 mil habitantes e equipamentos em uso
                SUS abaixo do necessário. Clique pra ver a lista.
              </InfoIcon>
            ),
          },
          {
            key: "regioes-saude-hipo",
            label: "Regiões de Saúde Hipossuficientes",
            value:
              regioesSaudeHipo != null && regioesSaudeTotal != null
                ? `${regioesSaudeHipo} de ${regioesSaudeTotal}`
                : "—",
            variant: "destructive",
            onClick: () => verHipo("regiaoSaude"),
            ativo: nivelForcado === "regiaoSaude",
            info: (
              <InfoIcon>
                Regiões de saúde com equipamentos em uso SUS abaixo do
                necessário. Clique pra ver a lista.
              </InfoIcon>
            ),
          },
          {
            key: "macros-hipo",
            label: "Macrorregiões com Hipossuficiente",
            value: `${macrosHipo} de ${rows.length}`,
            variant: "destructive",
            onClick: () => verHipo("macro"),
            ativo: nivelForcado === "macro",
          },
        ]}
      />
      <div className="mt-5 rounded-lg bg-card">
        <div className="flex flex-col items-stretch gap-3 border-b border-border px-4.5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="text-sm font-semibold">Cobertura Assistencial</div>
            {nivelForcado && (
              <button
                type="button"
                onClick={sairDoHipo}
                className="cursor-pointer rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-[11px] font-semibold text-destructive"
              >
                ✕ Sair da visão Hipo
              </button>
            )}
          </div>
          <StatusFilterButtons
            selecionados={statusFiltro}
            onChange={setStatusFiltro}
          />
        </div>
        {nivelTabela === "macro" ? (
          <CoberturaTable
            equipmentFamily={familia}
            rows={rows}
            macros={macros}
            subNivelSelecionados={[
              ...filtros.regioesSaude,
              ...filtros.municipios,
            ]}
            statusFiltro={statusFiltro}
          />
        ) : (
          <NivelCoberturaTable
            equipmentFamily={familia}
            nivel={nivelTabela}
            states={filtros.ufs}
            macroCodes={filtros.macros}
            healthRegionCodes={filtros.regioesSaude}
            municipalities={filtros.municipios}
            semCorteDePopulacao={Boolean(
              filtros.municipios.length || filtros.cnes.length,
            )}
            statusFiltro={statusFiltro}
            subNivelSelecionados={[
              ...filtros.regioesSaude,
              ...filtros.municipios,
            ]}
          />
        )}
      </div>
      <EstabelecimentoTable
        equipmentFamily={familia}
        states={filtros.ufs}
        macroCodes={filtros.macros}
        healthRegionCodes={filtros.regioesSaude}
        municipalities={filtros.municipios}
        cnesCodes={filtros.cnes}
      />
    </>
  );
}
