import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent } from "../ui/dialog";
import { FilterWorkspace } from "../common/filter-workspace";
import { MultiSelectFilter } from "../common/multi-select-filter";
import { ExportSecaoAba } from "../features/export-secao-aba";
import { REGIOES } from "../../data/constants";
import { useFiltrosMacro } from "../../hooks/useFiltrosMacro";
import {
  fetchEstabelecimentosPage,
  type FacilityOption,
} from "../../services/api";
import {
  CAMPOS_XLSX_COBERTURA,
  CAMPOS_XLSX_ESTABELECIMENTO,
  gerarXlsxTomografos,
} from "../../utils/export-xlsx";
import type {
  CoberturaRow,
  EstabelecimentoRow,
  Macrorregiao,
} from "../../types/domain";

interface Props {
  onClose: () => void;
  equipmentFamily: string;
  macros: Macrorregiao[];
  coberturaRowsTodas: CoberturaRow[];
  facilities: FacilityOption[];
  filtrosIniciais: {
    regioes: string[];
    ufs: string[];
    macros: string[];
    regioesSaude: string[];
    municipios: string[];
    cnes: string[];
  };
}

function toggleNoSet(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function ExportXlsxModal({
  onClose,
  equipmentFamily,
  macros,
  coberturaRowsTodas,
  facilities,
  filtrosIniciais,
}: Props) {
  // "usar filtros da tela" x "exportar tudo" -- quando desligado, o hook roda
  // sem recorte nenhum e a planilha sai completa.
  const [usarFiltros, setUsarFiltros] = useState(true);

  const filtros = useFiltrosMacro({
    macros,
    coberturaRows: coberturaRowsTodas,
    facilities,
    inicial: filtrosIniciais,
  });

  const [usarCobertura, setUsarCobertura] = useState(true);
  const [usarEstabelecimentos, setUsarEstabelecimentos] = useState(true);
  const [camposCobertura, setCamposCobertura] = useState(
    new Set(CAMPOS_XLSX_COBERTURA.map((c) => c.key)),
  );
  const [camposEstabelecimentos, setCamposEstabelecimentos] = useState(
    new Set(CAMPOS_XLSX_ESTABELECIMENTO.map((c) => c.key)),
  );

  const nadaSelecionado = !usarCobertura && !usarEstabelecimentos;

  async function buscarEstabelecimentos(): Promise<EstabelecimentoRow[]> {
    const PAGE_SIZE = 2000;
    let page = 1;
    let todos: EstabelecimentoRow[] = [];
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetchEstabelecimentosPage({
        equipmentFamily,
        states: usarFiltros ? filtros.estadosFiltro : undefined,
        macroCodes: usarFiltros ? filtros.macrosFiltro : undefined,
        healthRegionCodes: usarFiltros ? filtros.regioesSaudeFiltro : undefined,
        municipalities: usarFiltros ? filtros.municipiosFiltro : undefined,
        cnesCodes: usarFiltros ? filtros.cnesFiltro : undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      todos = todos.concat(res.items);
      if (todos.length >= res.total || res.items.length < PAGE_SIZE) break;
      page += 1;
    }
    return todos;
  }

  // Geracao da planilha e uma ACAO sob demanda (disparada pelo clique em
  // "Gerar Excel"), nao leitura automatica de tela -- por isso `useMutation`,
  // nao `useQuery` (2026-09-11). `buscarEstabelecimentos` continua paginando
  // manualmente ate esgotar o total (endpoint nao devolve tudo de uma vez).
  const gerarMutation = useMutation({
    mutationFn: async () => {
      // a aba de Cobertura precisa dos estabelecimentos pra montar a quebra
      // por regiao de saude e municipio (os niveis do drill-down).
      const estabelecimentos = await buscarEstabelecimentos();
      const linhasCobertura = usarFiltros
        ? filtros.filteredRows
        : coberturaRowsTodas;

      await gerarXlsxTomografos({
        equipmentFamily,
        filtrosResumo: usarFiltros ? filtros.filtrosResumo : "",
        cobertura: usarCobertura
          ? {
              rows: linhasCobertura,
              macros,
              estabelecimentos,
              campos: camposCobertura,
            }
          : undefined,
        estabelecimentos: usarEstabelecimentos
          ? { rows: estabelecimentos, campos: camposEstabelecimentos }
          : undefined,
      });
    },
    onSuccess: onClose,
  });
  const gerando = gerarMutation.isPending;
  const erro = gerarMutation.isError
    ? "Não foi possível gerar a planilha. Tente novamente."
    : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-label="Janela de diálogo"
        showCloseButton={false}
        className="max-h-[90vh] w-full max-w-[580px] overflow-auto rounded-[10px] bg-card p-8"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[22px] font-extrabold text-[#16213e]">
              Exportar Excel
            </div>
            <div className="mt-1.5 text-[13px] text-muted-foreground">
              A planilha sai com uma aba de <strong>Metodologia</strong>{" "}
              explicando os cálculos, mais as abas de dados que você escolher.
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="cursor-pointer border-none bg-transparent p-1 text-xl leading-none text-muted-foreground/70"
          >
            ✕
          </button>
        </div>

        <div className="mt-3.5 rounded-[6px] border border-border bg-background p-3">
          <label className="flex cursor-pointer items-center gap-2 text-[13px] font-bold text-[#16213e]">
            <input
              type="checkbox"
              checked={usarFiltros}
              onChange={() => setUsarFiltros((v) => !v)}
              className="h-[15px] w-[15px] accent-primary"
            />
            Aplicar filtros na exportação
          </label>
          <div
            className={`mt-1 text-[11.5px] text-muted-foreground ${usarFiltros ? "mb-2.5" : ""}`}
          >
            {usarFiltros
              ? "A planilha sai só com o recorte escolhido abaixo."
              : "A planilha sai com todos os dados, sem nenhum recorte."}
          </div>

          {usarFiltros && (
            <FilterWorkspace
              className="mb-0 border-0 py-0"
              hasAnyFilter={filtros.hasAnyFilter}
              onClear={filtros.limparFiltros}
            >
              <MultiSelectFilter
                placeholder="CNES"
                options={filtros.cnesOptions}
                selected={filtros.filtroCnes}
                onChange={filtros.setFiltroCnes}
              />
              <MultiSelectFilter
                placeholder="Região"
                options={REGIOES.map((r) => ({ value: r, label: r }))}
                selected={filtros.filtroRegioes}
                onChange={(v) => {
                  filtros.setFiltroRegioes(v);
                  filtros.setFiltroUfs([]);
                  filtros.setFiltroMacros([]);
                  filtros.setFiltroRegioesSaude([]);
                  filtros.setFiltroMunicipios([]);
                  filtros.setFiltroCnes([]);
                }}
              />
              <MultiSelectFilter
                placeholder="Estado (UF)"
                options={filtros.ufOptions}
                selected={filtros.filtroUfs}
                onChange={(v) => {
                  filtros.setFiltroUfs(v);
                  filtros.setFiltroMacros([]);
                  filtros.setFiltroRegioesSaude([]);
                  filtros.setFiltroMunicipios([]);
                  filtros.setFiltroCnes([]);
                }}
              />
              <MultiSelectFilter
                placeholder="Macrorregião de Saúde"
                options={filtros.macroOptions}
                selected={filtros.filtroMacros}
                onChange={(v) => {
                  filtros.setFiltroMacros(v);
                  filtros.setFiltroRegioesSaude([]);
                  filtros.setFiltroMunicipios([]);
                  filtros.setFiltroCnes([]);
                }}
              />
              <MultiSelectFilter
                placeholder="Região de Saúde"
                options={filtros.regiaoSaudeOptions}
                selected={filtros.filtroRegioesSaude}
                onChange={(v) => {
                  filtros.setFiltroRegioesSaude(v);
                  filtros.setFiltroMunicipios([]);
                  filtros.setFiltroCnes([]);
                }}
              />
              <MultiSelectFilter
                placeholder="Município"
                options={filtros.municipioOptions}
                selected={filtros.filtroMunicipios}
                onChange={(v) => {
                  filtros.setFiltroMunicipios(v);
                  filtros.setFiltroCnes([]);
                }}
              />
            </FilterWorkspace>
          )}
        </div>

        <ExportSecaoAba
          titulo="Aba: Cobertura por macrorregião"
          descricao="Detalha até município, com agrupamento (+/−) por macrorregião e região de saúde."
          ativa={usarCobertura}
          onToggleAtiva={() => setUsarCobertura((v) => !v)}
          campos={CAMPOS_XLSX_COBERTURA}
          selecionados={camposCobertura}
          onToggleCampo={(key) =>
            setCamposCobertura((prev) => toggleNoSet(prev, key))
          }
        />

        <ExportSecaoAba
          titulo="Aba: Estabelecimento por equipamento"
          descricao="Um estabelecimento por linha, com os subtipos (canais) numa coluna."
          ativa={usarEstabelecimentos}
          onToggleAtiva={() => setUsarEstabelecimentos((v) => !v)}
          campos={CAMPOS_XLSX_ESTABELECIMENTO}
          selecionados={camposEstabelecimentos}
          onToggleCampo={(key) =>
            setCamposEstabelecimentos((prev) => toggleNoSet(prev, key))
          }
        />

        {erro && <div className="mt-3 text-xs text-destructive">{erro}</div>}

        <div className="mt-5 flex gap-2.5">
          <button
            onClick={onClose}
            className="flex-1 rounded-[8px] border border-border bg-white px-4 py-2.75 text-[13px] font-bold text-muted-foreground"
          >
            Cancelar
          </button>
          <button
            onClick={() => gerarMutation.mutate()}
            disabled={nadaSelecionado || gerando}
            className={`flex-1 rounded-[8px] border-none px-4 py-2.75 text-[13px] font-bold text-white ${
              nadaSelecionado || gerando
                ? "cursor-default bg-[#9aa5c7]"
                : "cursor-pointer bg-success"
            }`}
          >
            {gerando ? "Gerando..." : "⬇ Gerar Excel"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
