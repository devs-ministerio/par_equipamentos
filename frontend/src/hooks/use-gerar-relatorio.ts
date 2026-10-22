import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-error";
import {
  baixarArquivo,
  gerarRelatorio,
  type FiltroRelatorio,
  type FormatoRelatorio,
  type NivelRelatorio,
  type TipoRelatorio,
} from "@/services/relatorios";

/** Lógica assíncrona de "gerar relatório" (Seção 7 da constituição: "toda
 * lógica assíncrona fica em hooks") -- compartilhada entre
 * `RelatorioGeradorForm` (Análise de Mérito) e a página de Instrumentos e
 * Repasse, que não usa mais aquele formulário (filtros divergiram demais
 * entre os dois relatórios pra caber num componente só). */
export function useGerarRelatorio(tipoRelatorio: TipoRelatorio) {
  const [gerando, setGerando] = useState<FormatoRelatorio | null>(null);
  const [erro, setErro] = useState<ApiError | null>(null);
  const emAndamento = useRef<AbortController | null>(null);
  useEffect(() => () => emAndamento.current?.abort(), []);

  async function gerar(
    formato: FormatoRelatorio,
    nivel: NivelRelatorio,
    filtro: FiltroRelatorio,
  ) {
    if (emAndamento.current) return;
    const controller = new AbortController();
    emAndamento.current = controller;
    setErro(null);
    setGerando(formato);
    try {
      const arquivo = await gerarRelatorio(
        formato,
        tipoRelatorio,
        nivel,
        filtro,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      baixarArquivo(arquivo);
      toast.success("Relatório gerado. O download foi iniciado.");
    } catch (e) {
      if (!controller.signal.aborted) {
        setErro(
          e instanceof ApiError ? e : new ApiError("Falha ao gerar relatório."),
        );
      }
    } finally {
      emAndamento.current = null;
      if (!controller.signal.aborted) setGerando(null);
    }
  }

  return { gerando, erro, gerar };
}
