import { ApiError } from "@/lib/api-error";
import { httpFetch, mensagemErroHttp } from "@/lib/http-client";

// ---------------------------------------------------------------------
// Relatórios Excel/Word (backend/app/routers/relatorios.py) -- Plan Mode
// docs/arquitetura/planmode-relatorios-2026-09-25.md, Bloco 3.
// ---------------------------------------------------------------------

export type EscopoRelatorio = "brasil" | "regiao" | "uf" | "municipio" | "cnes";
export type NivelRelatorio = "simplificado" | "completo";
export type FormatoRelatorio = "xlsx" | "docx";

export interface FiltroRelatorio {
  escopo: EscopoRelatorio;
  regiao?: string;
  uf?: string;
  municipio?: string;
  cnes?: string;
}

export interface ArquivoRelatorio {
  blob: Blob;
  nomeArquivo: string;
}

function nomeArquivoDoHeader(header: string | null, fallback: string): string {
  const match = header ? /filename="?([^"]+)"?/.exec(header) : null;
  return match?.[1] ?? fallback;
}

/** Baixa o relatório do backend -- rota binária (nenhum service usava
 * `httpFetch` cru até agora, ver comentário em `lib/http-client.ts`), então
 * trata status/erro aqui mesmo em vez de `requisitar` (que espera JSON). */
export async function gerarRelatorio(
  formato: FormatoRelatorio,
  nivel: NivelRelatorio,
  filtro: FiltroRelatorio,
): Promise<ArquivoRelatorio> {
  const params = new URLSearchParams({ formato, nivel, escopo: filtro.escopo });
  if (filtro.regiao) params.set("regiao", filtro.regiao);
  if (filtro.uf) params.set("uf", filtro.uf);
  if (filtro.municipio) params.set("municipio", filtro.municipio);
  if (filtro.cnes) params.set("cnes", filtro.cnes);

  const resposta = await httpFetch(`/relatorios?${params.toString()}`);
  if (!resposta.ok) {
    const mensagem = await mensagemErroHttp(resposta);
    throw new ApiError(mensagem, resposta.status, mensagem);
  }
  const blob = await resposta.blob();
  const nomeArquivo = nomeArquivoDoHeader(
    resposta.headers.get("content-disposition"),
    `relatorio.${formato}`,
  );
  return { blob, nomeArquivo };
}

/** Dispara o download no browser -- sem servidor de arquivo estático
 * envolvido, o blob já veio na resposta HTTP. */
export function baixarArquivo({ blob, nomeArquivo }: ArquivoRelatorio): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
