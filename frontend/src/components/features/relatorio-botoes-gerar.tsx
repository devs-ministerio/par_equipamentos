import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/common/error-alert";
import { FileSpreadsheet, FileText, LoaderCircle } from "lucide-react";
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
  emDialogo = false,
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
  emDialogo?: boolean;
}) {
  return (
    <section
      aria-label="Exportar relatório"
      className={
        emDialogo
          ? "border-t pt-3"
          : "rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        {!emDialogo && (
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-bold tracking-tight">
              Exportar
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {contexto ?? "Escolha o detalhamento e o formato."}
            </p>
          </div>
        )}

        <div
          role="group"
          aria-label="Nível de detalhamento"
          className="inline-flex gap-1 rounded-full bg-muted p-1"
        >
          {(
            [
              ["simplificado", "Simplificado"],
              ["completo", "Completo"],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              aria-pressed={nivel === valor}
              onClick={() => onNivelChange(valor)}
              className={cn(
                "min-h-9 cursor-pointer rounded-full px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring",
                nivel === valor
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {rotulo}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={!podeGerar || gerando !== null}
            onClick={() => onGerar("xlsx")}
          >
            {gerando === "xlsx" ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <FileSpreadsheet aria-hidden="true" />
            )}
            {gerando === "xlsx" ? "Preparando Excel…" : "Baixar Excel"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!podeGerar || gerando !== null}
            onClick={() => onGerar("docx")}
          >
            {gerando === "docx" ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <FileText aria-hidden="true" />
            )}
            {gerando === "docx" ? "Preparando Word…" : "Baixar Word"}
          </Button>
        </div>
      </div>

      {erro !== null && <ErrorAlert mensagem={mensagemSeguraDoErro(erro)} />}
    </section>
  );
}
