import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/common/error-alert";
import { FileSpreadsheet, FileText, LoaderCircle } from "lucide-react";
import {
  estiloInput,
  rotuloCampo,
} from "@/components/features/monitoramento-ui";
import { mensagemSeguraDoErro } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import type { FormatoRelatorio, NivelRelatorio } from "@/services/relatorios";

/** Nível (Simplificado/Completo) + botões Excel/Word -- último passo comum
 * aos dois relatórios (Análise de Mérito e Instrumentos e Repasse),
 * reaproveitado pra não duplicar o bloco de ação em cada página. */
export function RelatorioBotoesGerar({
  nivel,
  onNivelChange,
  podeGerar,
  gerando,
  erro,
  onGerar,
  contexto,
}: {
  nivel: NivelRelatorio;
  onNivelChange: (nivel: NivelRelatorio) => void;
  podeGerar: boolean;
  gerando: FormatoRelatorio | null;
  erro: unknown;
  onGerar: (formato: FormatoRelatorio) => void;
  /** Contexto opcional do relatório, usado quando a prévia já está visível
   * na página e a área de exportação fecha o fluxo. */
  contexto?: string;
}) {
  return (
    <section aria-label="Exportar relatório" className="relative border border-border bg-muted/35 px-4 py-5 sm:px-6 sm:py-6">
      <div className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden="true" />
      <div className="grid gap-5 pl-1 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-end">
        <div>
          <p className="text-[10px] font-bold tracking-[0.1em] text-primary uppercase">
            <span className="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground">05</span>
            Exportação
          </p>
          <h2 className="mt-1 font-display text-xl font-bold tracking-[-0.03em] text-foreground sm:text-2xl">
            Pronto para levar com você
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {contexto ?? "Escolha o nível de detalhamento e o formato do arquivo."}
          </p>
        </div>

        <label className="flex flex-col gap-1">
          <span className={rotuloCampo}>Nível de detalhamento</span>
          <select
            className={cn(estiloInput, "bg-background")}
            value={nivel}
            onChange={(e) => onNivelChange(e.target.value as NivelRelatorio)}
          >
            <option value="simplificado">Simplificado</option>
            <option value="completo">Completo</option>
          </select>
        </label>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:min-w-[380px]">
        <Button
          type="button"
          disabled={!podeGerar || gerando !== null}
          onClick={() => onGerar("xlsx")}
          className="h-auto min-h-14 w-full justify-start gap-3 rounded-sm px-4 py-3 text-left transition-colors duration-150"
        >
          {gerando === "xlsx" ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : <FileSpreadsheet aria-hidden="true" className="size-5" />}
          <span className="flex min-w-0 flex-col items-start gap-0.5">
            <span className="text-sm font-semibold">{gerando === "xlsx" ? "Preparando Excel…" : "Baixar Excel"}</span>
            <span className="text-[10px] font-normal opacity-80">Planilha editável · .xlsx</span>
          </span>
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!podeGerar || gerando !== null}
          onClick={() => onGerar("docx")}
          className="h-auto min-h-14 w-full justify-start gap-3 rounded-sm border-border bg-card px-4 py-3 text-left transition-colors duration-150 hover:border-primary/50 hover:bg-primary/5"
        >
          {gerando === "docx" ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : <FileText aria-hidden="true" className="size-5 text-primary" />}
          <span className="flex min-w-0 flex-col items-start gap-0.5">
            <span className="text-sm font-semibold">{gerando === "docx" ? "Preparando Word…" : "Baixar Word"}</span>
            <span className="text-[10px] font-normal text-muted-foreground">Documento pronto para leitura · .docx</span>
          </span>
        </Button>
        </div>
      </div>

      {erro !== null && <ErrorAlert mensagem={mensagemSeguraDoErro(erro)} />}
    </section>
  );
}
