import { ApiError } from "@/lib/api-error";
import { httpFetch, mensagemErroHttp } from "@/lib/http-client";

// ---------------------------------------------------------------------
// Relatórios Excel/Word (backend/app/routers/relatorios.py) -- Plan Mode
// docs/arquitetura/planmode-relatorios-2026-09-25.md, Blocos 3, 6 e 7.
// ---------------------------------------------------------------------

export type EscopoRelatorio = "brasil" | "regiao" | "uf" | "municipio" | "cnes";
export type NivelRelatorio = "simplificado" | "completo";
export type FormatoRelatorio = "xlsx" | "docx";
// Dois relatórios INDEPENDENTES (pedido do usuário 2026-09-26: "separar o
// relatório de instrumentos e repasse do relatório de análise de mérito").
export type TipoRelatorio = "instrumentos_repasse" | "analise_merito";

export interface FiltroRelatorio {
  escopo: EscopoRelatorio;
  regiao?: string;
  uf?: string;
  municipio?: string;
  cnes?: string;
  /** Período de 2 datas (Bloco 8, 2026-09-27) -- só usado por
   * `instrumentos_repasse` (cobertura não tem dimensão de ano civil, é
   * execução/competência). Substitui o antigo `ano` único. */
  anoInicio?: number;
  anoFim?: number;
  // Mesmos filtros de "Instrumentos e repasses"/Dados Oficiais (Bloco 7) --
  // só se aplicam a `instrumentos_repasse`; `situacao`/`programa` filtram
  // só a seção de Convênios (vocabulário SICONV, não bate com Propostas/
  // Monitoramento, ver app/services/relatorios.py no backend).
  situacao?: string;
  programa?: string;
  tipoContratacao?: string;
  /** Achado ao vivo 2026-09-26: faltava no filtro do backend -- Equipamento
   * era o único filtro da UI que a prévia respeitava mas o arquivo gerado
   * ignorava. Só filtra Convênios (mesmo mecanismo de `/convenios`). */
  equipamento?: string;
  busca?: string;
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
  tipoRelatorio: TipoRelatorio,
  nivel: NivelRelatorio,
  filtro: FiltroRelatorio,
): Promise<ArquivoRelatorio> {
  const params = new URLSearchParams({
    formato,
    tipo_relatorio: tipoRelatorio,
    nivel,
    escopo: filtro.escopo,
  });
  if (filtro.regiao) params.set("regiao", filtro.regiao);
  if (filtro.uf) params.set("uf", filtro.uf);
  if (filtro.municipio) params.set("municipio", filtro.municipio);
  if (filtro.cnes) params.set("cnes", filtro.cnes);
  if (filtro.anoInicio) params.set("ano_inicio", String(filtro.anoInicio));
  if (filtro.anoFim) params.set("ano_fim", String(filtro.anoFim));
  if (filtro.situacao) params.set("situacao", filtro.situacao);
  if (filtro.programa) params.set("programa", filtro.programa);
  if (filtro.tipoContratacao)
    params.set("tipo_contratacao", filtro.tipoContratacao);
  if (filtro.equipamento) params.set("equipamento", filtro.equipamento);
  if (filtro.busca) params.set("busca", filtro.busca);

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
