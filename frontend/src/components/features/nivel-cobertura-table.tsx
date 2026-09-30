import { useEffect, useMemo, useState } from "react";
import type {
  NivelCoberturaRow as NivelCoberturaRowData,
  StatusCobertura,
} from "@/types/domain";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/common/pagination";
import { useNivelCobertura } from "@/hooks/useNivelCobertura";
import { mensagemSeguraDoErro } from "@/lib/api-error";
import { SortableTableHead } from "@/components/common/sortable-table-head";
import { MobileTableSort } from "@/components/common/mobile-table-sort";
import { InfoIcon } from "./info-icon";
import { NivelCoberturaRow } from "./nivel-cobertura-row";
import { MunicipioDetalheModal } from "./municipio-detalhe-modal";

const PAGE_SIZE = 20;

interface Props {
  equipmentFamily: string;
  nivel: "regiaoSaude" | "municipio";
  states?: string[];
  macroCodes?: string[];
  healthRegionCodes?: string[];
  municipalities?: string[];
  /** true quando o usuario ja escolheu Municipio/CNES especifico -- desliga
   * o corte de populacao minima (ele quer ver aquele municipio do jeito que for). */
  semCorteDePopulacao?: boolean;
  /** Filtro Hiper/Hipo -- controlado pelo Dashboard, que mostra os botões
   * junto do título "Cobertura Assistencial" (não mais dentro da tabela). */
  statusFiltro: Set<StatusCobertura>;
  /** chaves ja selecionadas no filtro -- so destaque visual nas sub-linhas
   * de Municipio dentro de uma Regiao de Saude expandida (clicar nao filtra
   * mais, so abre detalhe). */
  subNivelSelecionados: string[];
}

type SortKey = "nome" | "uf" | "populacao" | "cobertura" | "status";

export function NivelCoberturaTable({
  equipmentFamily,
  nivel,
  states,
  macroCodes,
  healthRegionCodes,
  municipalities,
  semCorteDePopulacao,
  statusFiltro,
  subNivelSelecionados,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("nome");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [detalheAberto, setDetalheAberto] =
    useState<NivelCoberturaRowData | null>(null);

  const { rows, loading, error } = useNivelCobertura({
    equipmentFamily,
    nivel,
    states,
    macroCodes,
    healthRegionCodes,
    municipalities,
    semCorteDePopulacao,
  });

  const statesKey = states?.join(",") ?? "";
  const macrosKey = macroCodes?.join(",") ?? "";
  const regioesSaudeKey = healthRegionCodes?.join(",") ?? "";
  const municipiosKey = municipalities?.join(",") ?? "";

  useEffect(
    () => setPage(1),
    [
      statusFiltro,
      sortKey,
      sortDir,
      nivel,
      statesKey,
      macrosKey,
      regioesSaudeKey,
      municipiosKey,
    ],
  );

  // so nivel='regiaoSaude' expande (pra Municipio) -- Municipio ja e o nivel
  // mais fino que a base tem. O fetch sob demanda de cada regiao mora em
  // NivelCoberturaRow (useMunicipalityByHealthRegion).
  function toggleExpandida(chave: string) {
    setExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave);
      else next.add(chave);
      return next;
    });
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const rowsFiltradas = useMemo(() => {
    if (statusFiltro.size === 0) return rows;
    return rows.filter((r) => statusFiltro.has(r.status));
  }, [rows, statusFiltro]);

  const rowsOrdenadas = useMemo(() => {
    const copia = [...rowsFiltradas];
    copia.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "nome":
          cmp = a.nome.localeCompare(b.nome);
          break;
        case "uf":
          cmp = a.uf.localeCompare(b.uf);
          break;
        case "populacao":
          cmp = a.pop - b.pop;
          break;
        case "cobertura":
          cmp = a.cobertura - b.cobertura;
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copia;
  }, [rowsFiltradas, sortKey, sortDir]);

  const rowsPaginadas = useMemo(
    () => rowsOrdenadas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rowsOrdenadas, page],
  );

  const tituloColuna = nivel === "municipio" ? "Município" : "Região de saúde";

  return (
    <>
      {error && (
        <div className="px-4.5 py-2.5 text-[12.5px] text-destructive">
          Não foi possível carregar ({mensagemSeguraDoErro(error)}).
        </div>
      )}
      <MobileTableSort
        value={sortKey}
        direction={sortDir}
        options={[{ value: "nome", label: "Nome" }, { value: "uf", label: "UF" }, { value: "populacao", label: "População" }, { value: "cobertura", label: "Cobertura" }, { value: "status", label: "Status" }]}
        onChange={(key) => { setSortKey(key); setSortDir("asc"); }}
        onToggleDirection={() => setSortDir((direction) => direction === "asc" ? "desc" : "asc")}
      />
      <div className="min-w-0 sm:max-h-[340px] sm:overflow-y-auto" style={{ opacity: loading ? 0.6 : 1, transition: "opacity .15s" }}>
        <Table className="text-[12.5px]">
          <TableHeader className="sticky top-0 z-[2] hidden bg-card text-[11px] tracking-wide text-muted-foreground uppercase sm:table-header-group">
            <TableRow className="[&>*]:whitespace-normal">
              <SortableTableHead
                className="py-2.5 pr-1.5 pl-4.5"
                ativo={sortKey === "nome"}
                direcao={sortDir}
                onToggle={() => toggleSort("nome")}
              >
                {tituloColuna}
              </SortableTableHead>
              <SortableTableHead
                className="w-[46px] py-2.5 pr-2 pl-1.5"
                ativo={sortKey === "uf"}
                direcao={sortDir}
                onToggle={() => toggleSort("uf")}
              >
                UF
              </SortableTableHead>
              <TableHead className="w-[220px] py-2.5 px-2">
                Macrorregião
              </TableHead>
              {nivel === "municipio" && (
                <TableHead className="w-[180px] py-2.5 px-2">
                  Região de saúde
                </TableHead>
              )}
              <SortableTableHead
                className="w-[190px] py-2.5 pr-2 pl-2.5 text-right"
                align="right"
                ativo={sortKey === "populacao"}
                direcao={sortDir}
                onToggle={() => toggleSort("populacao")}
              >
                População SUS-dep.
              </SortableTableHead>
              <SortableTableHead
                className="w-[259px] py-2.5 pr-8 pl-2"
                ativo={sortKey === "cobertura"}
                direcao={sortDir}
                onToggle={() => toggleSort("cobertura")}
                extra={
                  <InfoIcon>
                    <div className="mb-1.5 font-bold text-[#93c5fd]">
                      Coeficiente
                    </div>
                    <div className="rounded bg-white/10 px-2 py-1.5 font-mono text-[11px]">
                      Equipamentos em uso SUS ÷ população SUS-dependente, na
                      proporção esperada
                    </div>
                    <div className="mt-2 text-[10px] text-[#94a3b8]">
                      Abaixo de 1x é Hipossuficiente, 1x ou mais é
                      Hiperssuficiente.
                    </div>
                    {nivel === "municipio" && !semCorteDePopulacao && (
                      <div className="mt-2 text-[10px] text-[#94a3b8]">
                        Só municípios com mais de 100 mil habitantes aparecem
                        aqui.
                      </div>
                    )}
                  </InfoIcon>
                }
              >
                Cobertura
              </SortableTableHead>
              <TableHead className="w-[220px] py-2.5 pr-4.5 pl-8">
                <span className="flex items-center gap-1">
                  Status
                  <InfoIcon align="right">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full bg-destructive" />
                      <div>
                        <strong className="text-[#fca5a5]">
                          Hipossuficiente
                        </strong>
                        <br />
                        coeficiente &lt; 1x
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full bg-success" />
                      <div>
                        <strong className="text-[#86efac]">
                          Hiperssuficiente
                        </strong>
                        <br />
                        coeficiente ≥ 1x
                      </div>
                    </div>
                  </InfoIcon>
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowsPaginadas.map((r) => (
              <NivelCoberturaRow
                key={r.chave}
                row={r}
                nivel={nivel}
                equipmentFamily={equipmentFamily}
                subNivelSelecionados={subNivelSelecionados}
                expandida={expandidas.has(r.chave)}
                onToggle={() => toggleExpandida(r.chave)}
                onAbrirDetalhe={setDetalheAberto}
              />
            ))}
            {!loading && rowsPaginadas.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-4 px-4.5 text-[12.5px] text-muted-foreground whitespace-normal"
                >
                  Nenhum resultado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <Pagination
        page={page}
        totalItems={rowsOrdenadas.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
      {detalheAberto && (
        <MunicipioDetalheModal
          linha={detalheAberto}
          equipmentFamily={equipmentFamily}
          onClose={() => setDetalheAberto(null)}
        />
      )}
    </>
  );
}
