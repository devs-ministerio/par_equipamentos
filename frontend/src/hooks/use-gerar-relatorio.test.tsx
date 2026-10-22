import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-error";
import type { FiltroRelatorio, FormatoRelatorio } from "@/services/relatorios";
import { useGerarRelatorio } from "./use-gerar-relatorio";

const mimeXlsx =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const mimeDocx =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const criarUrl = vi.fn(
  (_arquivo: Blob) => "blob:http://localhost/relatorio-sintetico",
);
const revogarUrl = vi.fn();
const downloads: { nome: string; url: string }[] = [];

function respostaArquivo(formato: FormatoRelatorio, nome?: string) {
  return new Response(
    "conteúdo sintético: teste de transporte, não de formato",
    {
      headers: {
        "content-type": formato === "xlsx" ? mimeXlsx : mimeDocx,
        ...(nome
          ? { "content-disposition": `attachment; filename="${nome}"` }
          : {}),
      },
    },
  );
}

beforeEach(() => {
  criarUrl.mockClear();
  revogarUrl.mockClear();
  downloads.length = 0;
  // Somente fronteiras HTTP e download; hook, service e transporte são reais.
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = criarUrl;
      static revokeObjectURL = revogarUrl;
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push({ nome: this.download, url: this.href });
  });
  vi.spyOn(toast, "success");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const recortes: FiltroRelatorio[] = [
  { escopo: "brasil" },
  { escopo: "regiao", regiao: "Nordeste" },
  { escopo: "uf", uf: "BA" },
  { escopo: "municipio", uf: "BA", municipio: "SALVADOR" },
  { escopo: "cnes", cnes: "0000001" },
];
const combinacoes = recortes.flatMap((recorte) =>
  (["xlsx", "docx"] as const).map((formato) => ({ recorte, formato })),
);

describe("geração de relatórios com hook e transporte reais", () => {
  it.each(combinacoes)(
    "encaminha $recorte.escopo em $formato e baixa o nome enviado pelo servidor",
    async ({ recorte, formato }) => {
      // Arrange
      const fetchHttp = vi
        .fn()
        .mockResolvedValue(respostaArquivo(formato, `carteira.${formato}`));
      vi.stubGlobal("fetch", fetchHttp);
      const { result } = renderHook(() =>
        useGerarRelatorio("instrumentos_repasse"),
      );
      const filtro = {
        ...recorte,
        anoInicio: 2025,
        anoFim: 2026,
        situacao: "Em execução",
        programa: "Atenção & saúde",
        tipoContratacao: "Convênio",
        equipamento: "mamografo",
        busca: "Santa Casa",
      };
      // Act
      await act(() => result.current.gerar(formato, "completo", filtro));
      // Assert
      expect(fetchHttp).toHaveBeenCalledTimes(1);
      const [url, init] = fetchHttp.mock.calls[0];
      const pedido = new URL(String(url));
      expect(pedido.pathname).toBe("/relatorios");
      expect(Object.fromEntries(pedido.searchParams)).toEqual({
        ...recorte,
        formato,
        tipo_relatorio: "instrumentos_repasse",
        nivel: "completo",
        ano_inicio: "2025",
        ano_fim: "2026",
        situacao: "Em execução",
        programa: "Atenção & saúde",
        tipo_contratacao: "Convênio",
        equipamento: "mamografo",
        busca: "Santa Casa",
      });
      expect(init.credentials).toBe("include");
      expect(criarUrl).toHaveBeenCalledTimes(1);
      expect(criarUrl.mock.calls[0][0].type).toBe(
        formato === "xlsx" ? mimeXlsx : mimeDocx,
      );
      expect(criarUrl.mock.calls[0][0].size).toBeGreaterThan(0);
      expect(downloads).toEqual([
        {
          nome: `carteira.${formato}`,
          url: "blob:http://localhost/relatorio-sintetico",
        },
      ]);
      expect(revogarUrl).toHaveBeenCalledWith(
        "blob:http://localhost/relatorio-sintetico",
      );
      expect(document.querySelector("a[download]")).toBeNull();
      expect(toast.success).toHaveBeenCalledWith(
        "Relatório gerado. O download foi iniciado.",
      );
      expect(result.current).toMatchObject({ gerando: null, erro: null });
    },
  );

  it.each([403, 422, 503])(
    "encerra o loading e não inicia download após HTTP %s",
    async (status) => {
      // Arrange
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            Response.json(
              { error: "Não foi possível gerar o relatório." },
              { status },
            ),
          ),
      );
      const { result } = renderHook(() =>
        useGerarRelatorio("instrumentos_repasse"),
      );
      // Act
      await act(() =>
        result.current.gerar("xlsx", "simplificado", { escopo: "brasil" }),
      );
      // Assert
      expect(result.current.gerando).toBeNull();
      expect(result.current.erro).toBeInstanceOf(ApiError);
      expect(result.current.erro).toMatchObject({ status });
      expect(criarUrl).not.toHaveBeenCalled();
      expect(downloads).toEqual([]);
      expect(toast.success).not.toHaveBeenCalled();
    },
  );

  it("expõe falha de rede sem erro cru e permite nova tentativa com nome padrão", async () => {
    // Arrange
    const fetchHttp = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("rede indisponível"))
      .mockResolvedValueOnce(respostaArquivo("docx"));
    vi.stubGlobal("fetch", fetchHttp);
    const { result } = renderHook(() => useGerarRelatorio("analise_merito"));
    // Act / Assert: falha não mantém loading nem dispara download.
    await act(() =>
      result.current.gerar("docx", "simplificado", { escopo: "brasil" }),
    );
    expect(result.current.erro).toBeInstanceOf(ApiError);
    expect(result.current.gerando).toBeNull();
    expect(downloads).toEqual([]);
    await act(() =>
      result.current.gerar("docx", "simplificado", { escopo: "brasil" }),
    );
    expect(result.current.erro).toBeNull();
    expect(downloads[0]?.nome).toBe("relatorio-sem-nome.docx");
    expect(
      new URL(String(fetchHttp.mock.calls[1][0])).searchParams.get(
        "tipo_relatorio",
      ),
    ).toBe("analise_merito");
  });

  it("informa o formato em geração enquanto a resposta HTTP está pendente", async () => {
    // Arrange
    let entregar!: (resposta: Response) => void;
    const respostaPendente = new Promise<Response>((resolve) => {
      entregar = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => respostaPendente),
    );
    const { result } = renderHook(() =>
      useGerarRelatorio("instrumentos_repasse"),
    );
    let operacao!: Promise<void>;
    // Act
    act(() => {
      operacao = result.current.gerar("xlsx", "completo", { escopo: "brasil" });
    });
    // Assert
    expect(result.current.gerando).toBe("xlsx");
    expect(downloads).toEqual([]);
    await act(async () => {
      entregar(respostaArquivo("xlsx"));
      await operacao;
    });
    expect(result.current.gerando).toBeNull();
    expect(downloads[0]?.nome).toBe("relatorio-sem-nome.xlsx");
  });
});
