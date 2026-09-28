import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-error";
import { monitoramentoKeys } from "./monitoramento-query-keys";
import { useAuthSession } from "./useAuthSession";

vi.mock("@/services/auth", () => ({
  fetchCurrentUser: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

const USUARIO_ADMIN = {
  id: 1,
  name: "Pessoa Administradora",
  email: "admin@sigeo.local",
  role: "admin" as const,
  status: "active" as const,
  created_at: "2026-09-24T10:00:00Z",
};

function criarAmbiente() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe("useAuthSession", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { fetchCurrentUser } = await import("@/services/auth");
    vi.mocked(fetchCurrentUser).mockResolvedValue(null);
  });

  it("expõe a sessão autenticada e a permissão de edição por papel", async () => {
    const { fetchCurrentUser } = await import("@/services/auth");
    vi.mocked(fetchCurrentUser).mockResolvedValueOnce(USUARIO_ADMIN);
    const { wrapper } = criarAmbiente();

    const { result } = renderHook(() => useAuthSession(), { wrapper });

    await waitFor(() => expect(result.current.autenticado).toBe(true));
    expect(result.current.usuarioAtual).toEqual(USUARIO_ADMIN);
    expect(result.current.podeEditar).toBe(true);
    expect(result.current.checandoSessao).toBe(false);
  });

  it("mantém visitante anônimo sem permissão de edição", async () => {
    const { wrapper } = criarAmbiente();
    const { result } = renderHook(() => useAuthSession(), { wrapper });

    await waitFor(() => expect(result.current.checandoSessao).toBe(false));
    expect(result.current.autenticado).toBe(false);
    expect(result.current.podeEditar).toBe(false);
    expect(result.current.usuarioAtual).toBeNull();
  });

  it("reconsulta o usuário após login bem-sucedido", async () => {
    const { fetchCurrentUser, login } = await import("@/services/auth");
    vi.mocked(fetchCurrentUser)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(USUARIO_ADMIN);
    vi.mocked(login).mockResolvedValueOnce(undefined);
    const { wrapper } = criarAmbiente();
    const { result } = renderHook(() => useAuthSession(), { wrapper });

    await waitFor(() => expect(result.current.checandoSessao).toBe(false));
    await act(async () => {
      await result.current.login({
        email: USUARIO_ADMIN.email,
        senha: "senha-segura",
      });
    });

    await waitFor(() =>
      expect(result.current.usuarioAtual).toEqual(USUARIO_ADMIN),
    );
    expect(login).toHaveBeenCalledWith(USUARIO_ADMIN.email, "senha-segura");
  });

  it("falha de forma explícita quando o navegador não mantém a sessão após o login", async () => {
    const { fetchCurrentUser, login } = await import("@/services/auth");
    vi.mocked(fetchCurrentUser).mockResolvedValue(null);
    vi.mocked(login).mockResolvedValueOnce(undefined);
    const { wrapper } = criarAmbiente();
    const { result } = renderHook(() => useAuthSession(), { wrapper });

    await waitFor(() => expect(result.current.checandoSessao).toBe(false));
    await act(async () => {
      await expect(
        result.current.login({ email: USUARIO_ADMIN.email, senha: "senha-segura" }),
      ).rejects.toMatchObject({
        publicMessage:
          "Não foi possível concluir a sessão. Verifique se o navegador permite cookies para o SIGEO e tente novamente.",
      });
    });
  });

  it("remove dados autenticados e marca visitante antes de concluir a revogação", async () => {
    const { fetchCurrentUser, logout } = await import("@/services/auth");
    vi.mocked(fetchCurrentUser).mockResolvedValueOnce(USUARIO_ADMIN);
    vi.mocked(logout).mockRejectedValueOnce(new Error("Sem rede"));
    const { queryClient, wrapper } = criarAmbiente();
    queryClient.setQueryData(monitoramentoKeys.instrumentos, [
      { nr_convenio: "123" },
    ]);
    const { result } = renderHook(() => useAuthSession(), { wrapper });

    await waitFor(() => expect(result.current.autenticado).toBe(true));
    await act(async () => {
      await result.current.sair();
    });

    expect(logout).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(monitoramentoKeys.currentUser)).toBeNull();
    expect(
      queryClient.getQueryData(monitoramentoKeys.instrumentos),
    ).toBeUndefined();
    await waitFor(() => expect(result.current.autenticado).toBe(false));
  });

  it("expõe a falha de sessão e permite pedir nova validação", async () => {
    const { fetchCurrentUser } = await import("@/services/auth");
    const erro = new ApiError("Servidor indisponível", 503);
    vi.mocked(fetchCurrentUser)
      .mockRejectedValueOnce(erro)
      .mockResolvedValueOnce(null);
    const { queryClient, wrapper } = criarAmbiente();
    const { result } = renderHook(() => useAuthSession(), { wrapper });

    await waitFor(() => expect(result.current.erroSessao).toBe(erro));
    result.current.tratarSessaoInvalida();

    await waitFor(() =>
      expect(
        queryClient.getQueryData(monitoramentoKeys.currentUser),
      ).toBeNull(),
    );
  });
});
