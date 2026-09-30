import { Fragment } from "react";
import type { NivelCoberturaRow as NivelCoberturaRowData } from "@/types/domain";
import { formatMultiplicador } from "@/utils/format";
import { calcularCoeficiente } from "@/utils/coeficiente";
import {
  getEquipamento,
  formatarQuantidadeEquipamento,
} from "@/data/constants";
import { TableCell, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/common/status-badge";
import { useMunicipalityByHealthRegion } from "@/hooks/useMunicipalityByHealthRegion";
import { BotaoDetalhe } from "./botao-detalhe";
import { SubNivelRows } from "./sub-nivel-rows";
import { CoberturaMobileCard } from "./cobertura-mobile-card";

interface Props {
  row: NivelCoberturaRowData;
  nivel: "regiaoSaude" | "municipio";
  equipmentFamily: string;
  subNivelSelecionados: string[];
  expandida: boolean;
  onToggle: () => void;
  onAbrirDetalhe: (row: NivelCoberturaRowData) => void;
}

/**
 * Uma linha da tabela de Cobertura Assistencial no nível Região de
 * Saúde/Município, com sua sub-camada de municípios carregada sob demanda ao
 * expandir uma região de saúde -- extraído de NivelCoberturaTable pra isolar
 * o fetch (`useMunicipalityByHealthRegion`) por linha em vez de um
 * `Record<chave, dados>` manual no componente pai.
 */
export function NivelCoberturaRow({
  row,
  nivel,
  equipmentFamily,
  subNivelSelecionados,
  expandida,
  onToggle,
  onAbrirDetalhe,
}: Props) {
  const equipamento = getEquipamento(equipmentFamily);
  const expansivel = nivel === "regiaoSaude";
  const { dados } = useMunicipalityByHealthRegion(
    equipmentFamily,
    row.chave,
    expansivel && expandida,
  );

  // Coeficiente = (equip. SUS x produtividade da familia) / populacao
  // SUS-dependente -- ver cobertura-macro-row.tsx pro mesmo calculo no nivel
  // macro (extraido em utils/coeficiente.ts, bug real corrigido 2026-08-21:
  // aqui tambem tinha 100_000 fixo).
  const {
    valor: coeficiente,
    corTexto,
    corBarra,
    fillPercent,
  } = calcularCoeficiente(row.oferta, row.pop, equipamento.produtividade);

  return (
    <Fragment>
      <TableRow
        onClick={expansivel ? onToggle : undefined}
        className={`hidden border-t border-border sm:table-row [&>*]:whitespace-normal ${expansivel ? "cursor-pointer" : ""}`}
      >
        <TableCell className="py-[9px] pr-1.5 pl-4.5 font-medium">
          {expansivel && (
            <span
              className="mr-1.5 inline-block text-[10px] text-muted-foreground transition-transform duration-150"
              style={{ transform: expandida ? "rotate(90deg)" : "none" }}
            >
              ▶
            </span>
          )}
          {row.nome}
        </TableCell>
        <TableCell className="py-[9px] pr-2 pl-1.5 text-muted-foreground">
          {row.uf}
        </TableCell>
        <TableCell className="py-[9px] px-2 text-muted-foreground">
          {row.macroNome ?? "—"}
        </TableCell>
        {nivel === "municipio" && (
          <TableCell className="py-[9px] px-2 text-muted-foreground">
            {row.regiaoSaudeNome ?? "—"}
          </TableCell>
        )}
        <TableCell className="py-[9px] pr-2 pl-2.5 text-right text-muted-foreground">
          {row.pop.toLocaleString("pt-BR")}
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
          <div className="flex items-center gap-2">
            <StatusBadge status={row.status} />
            {nivel === "municipio" && (
              <BotaoDetalhe onClick={() => onAbrirDetalhe(row)} />
            )}
          </div>
        </TableCell>
      </TableRow>
      <TableRow className="border-t border-border sm:hidden">
        <TableCell colSpan={nivel === "municipio" ? 7 : 6} className="p-0 whitespace-normal">
          <CoberturaMobileCard
            nome={row.nome}
            contexto={[row.uf, row.macroNome, nivel === "municipio" ? row.regiaoSaudeNome : null].filter(Boolean).join(" · ")}
            populacao={row.pop}
            coeficiente={coeficiente != null ? formatMultiplicador(coeficiente) : "—"}
            oferta={`${formatarQuantidadeEquipamento(row.oferta)} em uso SUS${row.ofertaTotal !== row.oferta ? ` de ${row.ofertaTotal} existentes` : ""}`}
            status={row.status}
            corTexto={corTexto}
            expandida={expandida}
            onToggle={expansivel ? onToggle : undefined}
            acao={nivel === "municipio" ? <BotaoDetalhe onClick={() => onAbrirDetalhe(row)} /> : undefined}
          />
        </TableCell>
      </TableRow>
      {expandida && (
        <TableRow className="bg-muted">
          <TableCell
            colSpan={nivel === "municipio" ? 7 : 6}
            className="min-w-0 px-3 py-2.5 whitespace-normal sm:pr-4.5 sm:pl-10.5"
          >
            {dados === "carregando" && (
              <div className="text-xs text-muted-foreground">
                Carregando municípios...
              </div>
            )}
            {dados === "erro" && (
              <div className="text-xs text-destructive">
                Não foi possível carregar os municípios.
              </div>
            )}
            {Array.isArray(dados) && (
              <SubNivelRows
                rows={dados}
                nivelAtual="municipio"
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
