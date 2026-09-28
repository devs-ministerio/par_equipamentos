import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/common/error-alert";
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
}: {
  nivel: NivelRelatorio;
  onNivelChange: (nivel: NivelRelatorio) => void;
  podeGerar: boolean;
  gerando: FormatoRelatorio | null;
  erro: unknown;
  onGerar: (formato: FormatoRelatorio) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <label className="flex max-w-[220px] flex-col gap-1">
        <span className={rotuloCampo}>Nível</span>
        <select
          className={cn(estiloInput, "bg-background")}
          value={nivel}
          onChange={(e) => onNivelChange(e.target.value as NivelRelatorio)}
        >
          <option value="simplificado">Simplificado</option>
          <option value="completo">Completo</option>
        </select>
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={!podeGerar || gerando !== null}
          onClick={() => onGerar("xlsx")}
        >
          {gerando === "xlsx" ? "Gerando Excel…" : "Gerar Excel"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!podeGerar || gerando !== null}
          onClick={() => onGerar("docx")}
        >
          {gerando === "docx" ? "Gerando Word…" : "Gerar Word"}
        </Button>
      </div>

      {erro !== null && <ErrorAlert mensagem={mensagemSeguraDoErro(erro)} />}
    </div>
  );
}
