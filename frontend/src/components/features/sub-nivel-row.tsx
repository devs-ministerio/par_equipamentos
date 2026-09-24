import { Fragment } from "react";
import type { NivelCoberturaRow } from "@/types/domain";
import { calcularCoeficiente } from "@/utils/coeficiente";
import { formatMultiplicador } from "@/utils/format";
import { formatarQuantidadeEquipamento } from "@/data/constants";
import { StatusBadge } from "@/components/common/status-badge";
import { useMunicipalityByHealthRegion } from "@/hooks/useMunicipalityByHealthRegion";
import { BotaoDetalhe } from "./botao-detalhe";
import { SubNivelRows } from "./sub-nivel-rows";

interface Props {
  linha: NivelCoberturaRow;
  nivelAtual: "regiaoSaude" | "municipio";
  equipmentFamily: string;
  produtividade: number;
  selecionados?: string[];
  completo: boolean;
  expandida: boolean;
  onToggle: () => void;
  onAbrirDetalhe: (linha: NivelCoberturaRow) => void;
}

/**
 * Uma linha de sub-camada (mora dentro de SubNivelRows) -- extraída pra
 * isolar o fetch sob demanda (`useMunicipalityByHealthRegion`, mesmo hook
 * usado por NivelCoberturaRow) de UMA região de saúde por vez, em vez do
 * `Record<chave, dados>` manual que existia no componente pai. Continua
 * recursiva: uma linha de Região de Saúde pode expandir em Municípios
 * chamando `SubNivelRows` de novo (nivelAtual="municipio"), cobrindo a
 * cadeia completa Macrorregião -> Região de Saúde -> Município.
 */
export function SubNivelRow({
  linha,
  nivelAtual,
  equipmentFamily,
  produtividade,
  selecionados,
  completo,
  expandida,
  onToggle,
  onAbrirDetalhe,
}: Props) {
  const coef = calcularCoeficiente(linha.oferta, linha.pop, produtividade);
  const expansivel = nivelAtual === "regiaoSaude";
  const { dados: filhos } = useMunicipalityByHealthRegion(
    equipmentFamily,
    linha.chave,
    expansivel && expandida,
  );
  const selecionada = selecionados?.includes(linha.chave);

  return (
    <Fragment>
      <tr
        onClick={
          expansivel
            ? (e) => {
                e.stopPropagation();
                onToggle();
              }
            : undefined
        }
        className={`border-t border-border ${expansivel ? "cursor-pointer" : ""} ${selecionada ? "bg-accent" : ""}`}
      >
        <td
          className="overflow-hidden py-1.5 pr-2 pl-1 font-medium text-foreground text-ellipsis whitespace-nowrap"
          title={`${linha.nome} (${linha.uf})`}
        >
          {expansivel && (
            <span
              className="mr-1.5 inline-block text-[9px] text-muted-foreground transition-transform duration-150"
              style={{ transform: expandida ? "rotate(90deg)" : "none" }}
            >
              ▶
            </span>
          )}
          {linha.nome}{" "}
          <span className="font-normal text-muted-foreground">
            ({linha.uf})
          </span>
        </td>
        {completo ? (
          <>
            <td className="w-[110px] py-1.5 px-2 text-right whitespace-nowrap text-muted-foreground">
              {linha.pop.toLocaleString("pt-BR")}
            </td>
            <td className="w-[210px] py-1.5 pr-6 pl-2">
              {/* bar com largura fixa (nao flex:1) -- em table-layout:fixed
                  sem width explicito no <td>, o navegador dividia o espaco
                  sobrando de forma instavel entre Nome e essa coluna,
                  esticando a barra bem alem do necessario e empurrando o
                  rotulo/status pra longe, desalinhado com o cabecalho (bug
                  real, 2026-08-24). */}
              <div className="flex items-center gap-2">
                <div className="relative h-[7px] w-[90px] shrink-0 overflow-clip rounded bg-muted">
                  <div
                    className="absolute top-0 left-0 h-full"
                    style={{
                      width: `${coef.fillPercent}%`,
                      background: coef.corBarra,
                    }}
                  />
                  <div className="absolute top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2 rounded-sm bg-muted-foreground" />
                </div>
                <div>
                  <div
                    className="text-[11px] font-semibold"
                    style={{ color: coef.corTexto }}
                  >
                    {coef.valor != null ? formatMultiplicador(coef.valor) : "—"}
                  </div>
                  <div className="text-[9.5px] text-muted-foreground">
                    {formatarQuantidadeEquipamento(linha.oferta)} em uso SUS
                    {linha.ofertaTotal !== linha.oferta &&
                      ` de ${linha.ofertaTotal} existentes`}
                  </div>
                </div>
              </div>
            </td>
            {/* width 168 (nao 130) -- "Hiperssuficiente" (rotulo mais longo
                do StatusBadge) + gap + BotaoDetalhe juntos passavam dos
                130px, empurrando o botao pra fora da celula/quebrando linha
                (bug real, 2026-08-24). whiteSpace:nowrap trava o layout numa
                linha so. */}
            <td className="w-[168px] py-1.5 pr-2 pl-4.5 whitespace-nowrap">
              <div className="flex items-center gap-2">
                <StatusBadge status={linha.status} />
                {nivelAtual === "municipio" && (
                  <BotaoDetalhe onClick={() => onAbrirDetalhe(linha)} />
                )}
              </div>
            </td>
          </>
        ) : (
          <td className="w-[76px] py-1.5 px-2 text-right whitespace-nowrap">
            <span
              className="text-[11px] font-semibold"
              style={{ color: coef.corTexto }}
            >
              {coef.valor != null ? formatMultiplicador(coef.valor) : "—"}
            </span>
          </td>
        )}
      </tr>
      {expandida && expansivel && (
        <tr>
          <td
            colSpan={completo ? 4 : 2}
            className="bg-background py-2 pr-2 pl-6.5"
          >
            {filhos === "carregando" && (
              <div className="p-1 text-xs text-muted-foreground">
                Carregando municípios...
              </div>
            )}
            {filhos === "erro" && (
              <div className="p-1 text-xs text-destructive">
                Não foi possível carregar os municípios.
              </div>
            )}
            {Array.isArray(filhos) && (
              <SubNivelRows
                rows={filhos}
                nivelAtual="municipio"
                equipmentFamily={equipmentFamily}
                selecionados={selecionados}
                completo={completo}
              />
            )}
          </td>
        </tr>
      )}
    </Fragment>
  );
}
