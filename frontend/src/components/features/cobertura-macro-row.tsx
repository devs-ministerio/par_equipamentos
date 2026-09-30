import { Fragment } from "react";
import type { CoberturaRow, Macrorregiao } from "@/types/domain";
import { formatMultiplicador } from "@/utils/format";
import { calcularCoeficiente } from "@/utils/coeficiente";
import {
  getEquipamento,
  formatarQuantidadeEquipamento,
} from "@/data/constants";
import { TableCell, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/common/status-badge";
import { useHealthRegionByMacro } from "@/hooks/useHealthRegionByMacro";
import { SubNivelRows } from "./sub-nivel-rows";
import { CoberturaMobileCard } from "./cobertura-mobile-card";

interface Props {
  row: CoberturaRow;
  macro: Macrorregiao;
  equipmentFamily: string;
  subNivelSelecionados: string[];
  expandida: boolean;
  onToggle: () => void;
}

/**
 * Uma linha de macro na tabela de Cobertura Assistencial (nível macro), com
 * sua sub-camada de regiões de saúde carregada sob demanda ao expandir --
 * extraído de CoberturaTable pra isolar o fetch (`useHealthRegionByMacro`)
 * numa única macro por vez, em vez de um `Record<macroId, dados>` manual no
 * componente pai.
 */
export function CoberturaMacroRow({
  row,
  macro,
  equipmentFamily,
  subNivelSelecionados,
  expandida,
  onToggle,
}: Props) {
  const equipamento = getEquipamento(equipmentFamily);
  const { dados } = useHealthRegionByMacro(
    equipmentFamily,
    macro.id,
    expandida,
  );

  // Coeficiente = (equip. SUS x produtividade da familia) / populacao
  // SUS-dependente -- quantos equipamentos por `produtividade` habitantes
  // essa macro tem, sem arredondar a demanda (diferente de required_qty, que
  // é ceil). A listra no meio da barra é o coeficiente 1 (a meta exata);
  // acima enche mais (hiper/verde), abaixo enche menos (hipo/vermelho).
  // Extraído em utils/coeficiente.ts pra não recalcular com produtividade
  // errada em cada tabela (bug real corrigido 2026-08-21).
  const {
    valor: coeficiente,
    corTexto,
    corBarra,
    fillPercent,
  } = calcularCoeficiente(row.oferta, macro.pop, equipamento.produtividade);

  return (
    <Fragment>
      <TableRow
        onClick={onToggle}
        className="hidden cursor-pointer border-t border-border sm:table-row [&>*]:whitespace-normal"
      >
        <TableCell className="py-[9px] pr-2 pl-4.5 font-mono text-[11.5px] text-muted-foreground">
          {macro.id}
        </TableCell>
        <TableCell className="py-[9px] pr-1.5 pl-2 font-medium">
          <span
            className="mr-1.5 inline-block text-[10px] text-muted-foreground transition-transform duration-150"
            style={{ transform: expandida ? "rotate(90deg)" : "none" }}
          >
            ▶
          </span>
          {macro.nome}
        </TableCell>
        <TableCell className="py-[9px] pr-2 pl-1.5 text-muted-foreground">
          {macro.uf}
        </TableCell>
        <TableCell className="py-[9px] pr-2 pl-2.5 text-right text-muted-foreground">
          {macro.pop.toLocaleString("pt-BR")}
        </TableCell>
        <TableCell className="min-w-[160px] py-[9px] pr-8 pl-2">
          <div className="flex items-center gap-1.5">
            <div className="relative h-2 flex-1 overflow-clip rounded bg-muted">
              <div
                className="absolute top-0 left-0 h-full"
                style={{ width: `${fillPercent}%`, background: corBarra }}
              />
              <div className="absolute top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2 rounded-sm bg-muted-foreground" />
            </div>
            <div className="w-[118px]">
              <div
                className="text-[11.5px] font-semibold"
                style={{ color: corTexto }}
              >
                {coeficiente != null ? formatMultiplicador(coeficiente) : "—"}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {formatarQuantidadeEquipamento(row.oferta)} em uso SUS
                {row.ofertaTotal !== row.oferta &&
                  ` de ${row.ofertaTotal} existentes`}
              </div>
            </div>
          </div>
        </TableCell>
        <TableCell className="py-[9px] pr-4.5 pl-8">
          <StatusBadge status={row.status} />
        </TableCell>
      </TableRow>
      <TableRow className="border-t border-border sm:hidden">
        <TableCell colSpan={6} className="p-0 whitespace-normal">
          <CoberturaMobileCard
            nome={macro.nome}
            contexto={`Macro ${macro.id} · ${macro.uf}`}
            populacao={macro.pop}
            coeficiente={coeficiente != null ? formatMultiplicador(coeficiente) : "—"}
            oferta={`${formatarQuantidadeEquipamento(row.oferta)} em uso SUS${row.ofertaTotal !== row.oferta ? ` de ${row.ofertaTotal} existentes` : ""}`}
            status={row.status}
            corTexto={corTexto}
            expandida={expandida}
            onToggle={onToggle}
          />
        </TableCell>
      </TableRow>
      {expandida && (
        <TableRow className="bg-muted">
          <TableCell
            colSpan={6}
            className="min-w-0 px-3 py-2.5 whitespace-normal sm:pr-4.5 sm:pl-10.5"
          >
            {dados === "carregando" && (
              <div className="text-xs text-muted-foreground">
                Carregando regiões de saúde...
              </div>
            )}
            {dados === "erro" && (
              <div className="text-xs text-destructive">
                Não foi possível carregar as regiões de saúde.
              </div>
            )}
            {Array.isArray(dados) && (
              <SubNivelRows
                rows={dados}
                nivelAtual="regiaoSaude"
                equipmentFamily={equipmentFamily}
                selecionados={subNivelSelecionados}
                completo
              />
            )}
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}
