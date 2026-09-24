import { useEffect, useState } from "react";
import type { EstabelecimentoRow } from "@/types/domain";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/common/pagination";
import { SearchInput } from "@/components/common/search-input";
import { useEstabelecimentosPage } from "@/hooks/useEstabelecimentosPage";
import { mensagemSeguraDoErro } from "@/lib/api-error";
import { SortableTableHead } from "@/components/common/sortable-table-head";
import { useEstabelecimentoDetalhe } from "@/hooks/useEstabelecimentoDetalhe";
import { BotaoDetalhe } from "./botao-detalhe";
import { MunicipioDetalheModal } from "./municipio-detalhe-modal";

interface Props {
  equipmentFamily: string;
  states?: string[];
  macroCodes?: string[];
  healthRegionCodes?: string[];
  municipalities?: string[];
  cnesCodes?: string[];
}

const PAGE_SIZE = 50;

type SortKey =
  | "cnes_code"
  | "facility_name"
  | "municipality_name"
  | "state"
  | "existing_qty"
  | "in_use_qty"
  | "sus_flag";

export function EstabelecimentoTable({
  equipmentFamily,
  states,
  macroCodes,
  healthRegionCodes,
  municipalities,
  cnesCodes,
}: Props) {
  const [page, setPage] = useState(1);
  const [buscaInput, setBuscaInput] = useState("");
  const [busca, setBusca] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("facility_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  // Estabelecimento cujo botao de detalhe foi clicado -- dispara o fetch sob
  // demanda em useEstabelecimentoDetalhe (mesmo modal de Cobertura
  // Assistencial, mas o municipio dele so e buscado quando pedido).
  const [alvoDetalhe, setAlvoDetalhe] = useState<{
    cnes: string;
    municipio: string;
    uf: string;
  } | null>(null);

  const { items, total, loading, error } = useEstabelecimentosPage({
    equipmentFamily,
    states,
    macroCodes,
    healthRegionCodes,
    municipalities,
    cnesCodes,
    search: busca || undefined,
    sortBy: sortKey,
    sortDir,
    page,
    pageSize: PAGE_SIZE,
  });

  const { detalhe, status: statusDetalhe } = useEstabelecimentoDetalhe(
    equipmentFamily,
    alvoDetalhe,
  );

  // debounce da busca -- nao dispara uma requisicao a cada tecla digitada
  useEffect(() => {
    const t = setTimeout(() => setBusca(buscaInput), 350);
    return () => clearTimeout(t);
  }, [buscaInput]);

  const statesKey = states?.join(",") ?? "";
  const macrosKey = macroCodes?.join(",") ?? "";
  const regioesSaudeKey = healthRegionCodes?.join(",") ?? "";
  const municipiosKey = municipalities?.join(",") ?? "";
  const cnesKey = cnesCodes?.join(",") ?? "";

  // volta pra pagina 1 sempre que filtro/busca/ordenacao mudar -- senao o
  // usuario pode ficar numa pagina que nao existe mais.
  useEffect(
    () => setPage(1),
    [
      statesKey,
      macrosKey,
      regioesSaudeKey,
      municipiosKey,
      cnesKey,
      busca,
      sortKey,
      sortDir,
    ],
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const erroDetalhe =
    statusDetalhe === "sem-dado" && alvoDetalhe
      ? `Sem dado de cobertura pra ${alvoDetalhe.municipio} (${alvoDetalhe.uf}).`
      : statusDetalhe === "erro" && alvoDetalhe
        ? `Não foi possível carregar a cobertura de ${alvoDetalhe.municipio} (${alvoDetalhe.uf}).`
        : null;

  function abrirDetalhe(r: EstabelecimentoRow) {
    setAlvoDetalhe({ cnes: r.cnes, municipio: r.municipio, uf: r.uf });
  }

  return (
    <div className="mt-5 rounded-lg bg-card">
      <div className="flex items-center gap-3 border-b border-border px-4.5 py-3.5">
        <div className="flex-1 text-sm font-semibold">
          Estabelecimentos de Saúde
        </div>
        <SearchInput
          value={buscaInput}
          onChange={setBuscaInput}
          placeholder="Buscar por nome, CNES ou município..."
        />
      </div>
      {error && (
        <div className="px-4.5 py-2.5 text-[12.5px] text-destructive">
          Não foi possível carregar ({mensagemSeguraDoErro(error)}).
        </div>
      )}
      {erroDetalhe && (
        <div className="px-4.5 py-2.5 text-[12.5px] text-destructive">
          {erroDetalhe}
        </div>
      )}
      <div
        style={{
          maxHeight: 340,
          overflow: "auto",
          opacity: loading ? 0.6 : 1,
          transition: "opacity .15s",
        }}
      >
        <Table className="text-[12.5px]">
          <TableHeader className="sticky top-0 z-[2] bg-card text-[11px] tracking-wide text-muted-foreground uppercase">
            <TableRow>
              <SortableTableHead
                className="py-[9px] px-4.5"
                ativo={sortKey === "cnes_code"}
                direcao={sortDir}
                onToggle={() => toggleSort("cnes_code")}
              >
                CNES
              </SortableTableHead>
              <SortableTableHead
                className="py-[9px] px-2.5"
                ativo={sortKey === "facility_name"}
                direcao={sortDir}
                onToggle={() => toggleSort("facility_name")}
              >
                Nome do estabelecimento
              </SortableTableHead>
              <SortableTableHead
                className="py-[9px] px-2.5"
                ativo={sortKey === "municipality_name"}
                direcao={sortDir}
                onToggle={() => toggleSort("municipality_name")}
              >
                Município
              </SortableTableHead>
              <SortableTableHead
                className="py-[9px] px-2.5"
                ativo={sortKey === "state"}
                direcao={sortDir}
                onToggle={() => toggleSort("state")}
              >
                UF
              </SortableTableHead>
              <SortableTableHead
                className="py-[9px] px-2.5 text-right"
                align="right"
                ativo={sortKey === "existing_qty"}
                direcao={sortDir}
                onToggle={() => toggleSort("existing_qty")}
              >
                Qtd equipamento
              </SortableTableHead>
              <SortableTableHead
                className="py-[9px] px-2.5 text-right"
                align="right"
                ativo={sortKey === "in_use_qty"}
                direcao={sortDir}
                onToggle={() => toggleSort("in_use_qty")}
              >
                Equipamentos em uso
              </SortableTableHead>
              <SortableTableHead
                className="py-[9px] px-4.5"
                ativo={sortKey === "sus_flag"}
                direcao={sortDir}
                onToggle={() => toggleSort("sus_flag")}
              >
                SUS
              </SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((r) => (
              <TableRow key={r.cnes} className="border-t border-border">
                <TableCell className="py-2 px-4.5 font-mono text-[11.5px] text-muted-foreground">
                  {r.cnes}
                </TableCell>
                <TableCell className="py-2 px-2.5 font-medium whitespace-normal">
                  {r.nome}
                </TableCell>
                <TableCell className="py-2 px-2.5 text-muted-foreground whitespace-normal">
                  {r.municipio}
                </TableCell>
                <TableCell className="py-2 px-2.5 text-muted-foreground">
                  {r.uf}
                </TableCell>
                <TableCell className="py-2 px-2.5 text-right font-semibold">
                  {r.qtd}
                </TableCell>
                <TableCell className="py-2 px-2.5 text-right text-muted-foreground">
                  {r.qtdUso}
                </TableCell>
                <TableCell className="py-2 px-4.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        r.susFlag
                          ? "rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success"
                          : "rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
                      }
                    >
                      {r.susFlag ? "Sim" : "Não"}
                    </span>
                    {r.susFlag &&
                      (alvoDetalhe?.cnes === r.cnes &&
                      statusDetalhe === "carregando" ? (
                        <span className="text-[10px] text-muted-foreground">
                          Carregando...
                        </span>
                      ) : (
                        <BotaoDetalhe onClick={() => abrirDetalhe(r)} />
                      ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!loading && items.length === 0 && (
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
        totalItems={total}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
      {alvoDetalhe && statusDetalhe === "sucesso" && detalhe && (
        <MunicipioDetalheModal
          linha={detalhe}
          equipmentFamily={equipmentFamily}
          onClose={() => setAlvoDetalhe(null)}
        />
      )}
    </div>
  );
}
