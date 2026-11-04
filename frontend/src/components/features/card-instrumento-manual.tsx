import { useState } from "react";
import { fmtData, fmtMoeda } from "@/lib/monitoramento-format";
import { nupDoInstrumento } from "@/lib/nup";
import { cn } from "@/lib/utils";
import { formatarCnpj } from "@/utils/texto";
import { DetalhesAnimados } from "@/components/common/detalhes-animados";
import { ChipIdentificador, ChipTipo } from "./chip-identificador";
import { LinkDetalheInstrumento } from "./link-detalhe-instrumento";
import { Campo, estiloCard, StatusPill } from "./monitoramento-ui";
import type { InstrumentoEquipamento } from "@/services/monitoramento-instrumentos";

/** Instrumento FAF ou TED de carga manual, mostrado entre as linhas de financiamento. */
export function CardInstrumentoManual({ i }: { i: InstrumentoEquipamento }) {
  const [detalheAberto, setDetalheAberto] = useState(false);
  const nup = nupDoInstrumento(i.tipo_contratacao, i.nr_convenio);
  const componente = i.componente ?? i.programa;
  const acompanhamento = i.acompanhamento;

  return (
    <div className={cn(estiloCard, "mb-3 min-w-0 max-sm:px-4 max-sm:py-3.5")}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <ChipTipo>{i.tipo_contratacao}</ChipTipo>
            <LinkDetalheInstrumento nrConvenio={i.nr_convenio}>
              <ChipIdentificador rotulo="NUP SEI">
                {nup ?? i.nr_convenio}
              </ChipIdentificador>
            </LinkDetalheInstrumento>
            {i.ano_instrumento && (
              <span className="font-mono text-[11.5px] text-muted-foreground">
                {i.ano_instrumento}
              </span>
            )}
            {i.equipamento_descricao && (
              <span className="rounded-full border border-border bg-background px-[11px] py-1 text-[13px] font-extrabold text-foreground">
                {i.equipamento_descricao}
              </span>
            )}
          </div>
          <div className="text-[15px] font-bold text-foreground">
            {i.nome_convenente}
          </div>
          {i.cnes && (
            <span className="mt-0.5 inline-block rounded-full bg-secondary px-2 py-0.5 font-mono text-[10.5px] font-bold text-primary">
              CNES {i.cnes}
            </span>
          )}
          <div className="mt-0.5 text-xs text-muted-foreground">
            {formatarCnpj(i.cnpj_convenente) || "—"} · {i.municipio || "—"}/
            {i.uf || "—"}
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-start gap-3 sm:flex-col sm:items-end">
          <StatusPill texto={i.fase_atual ?? i.situacao_programa} />
          <div className="min-w-0 sm:text-right">
            <div className="text-[10px] uppercase text-muted-foreground">
              Valor planejado
            </div>
            <div className="break-words text-base font-extrabold tabular-nums text-foreground">
              {fmtMoeda(i.investimento_aquisicao)}
            </div>
          </div>
        </div>
      </div>

      {componente && (
        <p className="mb-0 mt-3 rounded-md border border-border bg-background px-2.5 py-2 text-[12.5px] leading-normal break-words max-sm:border-l-[3px] max-sm:border-l-primary">
          <strong className="mr-1 text-[10.5px] uppercase text-muted-foreground">
            Componente:
          </strong>
          {componente}
        </p>
      )}

      <DetalhesAnimados
        className="mt-3 border-t border-border pt-2.5"
        aberto={detalheAberto}
        onAbertoChange={setDetalheAberto}
      >
        <div className="mt-3 grid [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))] gap-2.5">
          <Campo label="Programa">{i.programa || "—"}</Campo>
          <Campo label="Tipologia">{i.tipologia || "—"}</Campo>
          <Campo label="Modalidade">{i.modalidade_onco || "—"}</Campo>
          <Campo label="Natureza do serviço">{i.natureza_servico || "—"}</Campo>
          <Campo label="Nível de monitoramento">
            {i.nivel_monitoramento || "—"}
          </Campo>
          <Campo label="Técnico titular">{i.tecnico_titular || "—"}</Campo>
          <Campo label="Técnico suplente">{i.tecnico_suplente || "—"}</Campo>
          <Campo label="Entrega">
            {acompanhamento?.entrega_data
              ? fmtData(acompanhamento.entrega_data)
              : "—"}
          </Campo>
          <Campo label="Inauguração">
            {acompanhamento?.inauguracao_data
              ? `${fmtData(acompanhamento.inauguracao_data)}${acompanhamento.inauguracao_realizada ? "" : " (prevista)"}`
              : "—"}
          </Campo>
        </div>
        <div className="mt-3 border-t border-border pt-3 text-xs">
          <LinkDetalheInstrumento
            nrConvenio={i.nr_convenio}
            className="font-semibold text-primary underline"
          >
            Abrir no monitoramento interno
          </LinkDetalheInstrumento>
        </div>
      </DetalhesAnimados>
    </div>
  );
}
