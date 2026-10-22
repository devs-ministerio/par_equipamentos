import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useRelatorioEncerrados } from "./use-relatorio-encerrados";
import { gerarRelatorio } from "@/services/relatorios";

const resposta = () => ({
  total: 41,
  total_pendencias: 2,
  pagina: 1,
  pagina_pendencias: 1,
  limite: 20,
  itens: [],
  pendencias: [],
});
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={
      new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      })
    }
  >
    {children}
  </QueryClientProvider>
);
afterEach(() => vi.unstubAllGlobals());

it("não consulta quando Todos está selecionado", () => {
  // Arrange
  const fetchHttp = vi.fn();
  vi.stubGlobal("fetch", fetchHttp);
  // Act
  renderHook(() => useRelatorioEncerrados({ escopo: "brasil" }, false), {
    wrapper,
  });
  // Assert
  expect(fetchHttp).not.toHaveBeenCalled();
});

it("envia todos os filtros, pagina pendências separadamente e reinicia ao mudar o recorte", async () => {
  // Arrange
  const fetchHttp = vi
    .fn()
    .mockImplementation(() => Promise.resolve(Response.json(resposta())));
  vi.stubGlobal("fetch", fetchHttp);
  const { result, rerender } = renderHook(
    ({ uf }) =>
      useRelatorioEncerrados(
        {
          escopo: "uf",
          uf,
          municipio: "Anápolis",
          cnes: "0000010",
          anoInicio: 2025,
          anoFim: 2026,
          situacao: "Em execução",
          programa: "Programa",
          tipoContratacao: "Convênio",
          equipamento: "Mamógrafo",
          busca: "Sintético",
        },
        true,
      ),
    { wrapper, initialProps: { uf: "BA" } },
  );
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  // Act
  act(() => result.current.setPagina(2));
  await waitFor(() => expect(fetchHttp).toHaveBeenCalledTimes(2));
  act(() => result.current.setPaginaPendencias(2));
  await waitFor(() => expect(fetchHttp).toHaveBeenCalledTimes(3));
  const params = new URL(String(fetchHttp.mock.calls[2][0])).searchParams;
  // Assert
  expect(Object.fromEntries(params)).toMatchObject({
    pagina: "2",
    pagina_pendencias: "2",
    ano_inicio: "2025",
    ano_fim: "2026",
    tipo_contratacao: "Convênio",
    equipamento: "Mamógrafo",
    uf: "BA",
    municipio: "Anápolis",
    cnes: "0000010",
    programa: "Programa",
    situacao: "Em execução",
    busca: "Sintético",
  });
  rerender({ uf: "SP" });
  await waitFor(() => expect(fetchHttp).toHaveBeenCalledTimes(4));
  expect(result.current.pagina).toBe(1);
  expect(result.current.paginaPendencias).toBe(1);
});

it.each([
  Response.json({ total: "inválido" }),
  Response.json({ detail: "falha privada" }, { status: 503 }),
])(
  "normaliza falha de contrato ou de API sem repetir a consulta",
  async (respostaHttp) => {
    // Arrange
    const fetchHttp = vi.fn().mockResolvedValue(respostaHttp);
    vi.stubGlobal("fetch", fetchHttp);
    // Act
    const { result } = renderHook(
      () => useRelatorioEncerrados({ escopo: "brasil" }, true),
      { wrapper },
    );
    // Assert
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.name).toBe("ApiError");
    expect(result.current.data).toBeUndefined();
    expect(fetchHttp).toHaveBeenCalledTimes(1);
  },
);

it("envia o mesmo recorte de encerramento ao baixar o arquivo", async () => {
  // Arrange
  const fetchHttp = vi
    .fn()
    .mockResolvedValue(new Response("arquivo sintético"));
  vi.stubGlobal("fetch", fetchHttp);
  // Act
  await gerarRelatorio("xlsx", "instrumentos_repasse", "simplificado", {
    escopo: "uf",
    uf: "BA",
    encerramento: "encerrados",
  });
  // Assert
  expect(
    new URL(String(fetchHttp.mock.calls[0][0])).searchParams.get(
      "encerramento",
    ),
  ).toBe("encerrados");
});
