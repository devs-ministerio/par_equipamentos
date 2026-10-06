import { useState } from "react";
import { toast } from "sonner";
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
  const [erro, setErro] = useState<unknown>(null);

  async function gerar(
    formato: FormatoRelatorio,
    nivel: NivelRelatorio,
    filtro: FiltroRelatorio,
  ) {
    setErro(null);
    setGerando(formato);
    try {
      const arquivo = await gerarRelatorio(
        formato,
        tipoRelatorio,
        nivel,
        filtro,
      );
      baixarArquivo(arquivo);
      toast.success("Relatório gerado. O download foi iniciado.");
    } catch (e) {
      setErro(e);
    } finally {
      setGerando(null);
    }
  }

  return { gerando, erro, gerar };
}
