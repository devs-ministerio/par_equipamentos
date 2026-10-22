import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-error";
import { criarAprovacao } from "@/test-fixtures/aprovacao-legado";
import {
  prepararHooksRadar,
  limparHooksRadar,
} from "@/test-fixtures/radar-hooks";
import { useCandidatosLegados } from "./use-candidatos-legados";
import { useHistoricoLegado, useTriagemLegado } from "./useTriagemLegado";
import { useAprovacaoLegado } from "./useAprovacaoLegado";
import { monitoramentoKeys } from "./monitoramento-query-keys";

afterEach(limparHooksRadar);

const decisao = () => ({
  acao: "iniciar_analise" as const,
  chave: crypto.randomUUID(),
  captura_id: 11,
  versao: 0,
  justificativa: "Conferência sintética",
});

describe("triagem e aprovação — domínio e cache reais", () => {
  it.each(["admin", "gestor", "colaborador", "leitor"] as const)(
    "permissões apresentadas para %s não substituem autorização no servidor",
    async (role) => {
      const api = prepararHooksRadar(role);
      const { result } = renderHook(
        () => ({
          triagem: useTriagemLegado(7),
          aprovacao: useAprovacaoLegado(api.controle.candidato, true),
        }),
        { wrapper: api.wrapper },
      );
      await waitFor(() =>
        expect(
          api.client.getQueryState(monitoramentoKeys.currentUser)?.status,
        ).toBe("success"),
      );
      const permitido = role === "admin" || role === "gestor";
      expect(result.current.triagem.podeDecidir).toBe(permitido);
      expect(result.current.aprovacao.podeAprovar).toBe(permitido);
      if (permitido)
        await waitFor(() =>
          expect(result.current.aprovacao.prova.isSuccess).toBe(true),
        );
      else expect(api.chamadas("/prova")).toHaveLength(0);
      expect(api.chamadas("/decisoes")).toHaveLength(0);
      expect(api.chamadas("/aprovacoes")).toHaveLength(0);
    },
  );

  it("só captura prova quando a conferência abre e recaptura ao mudar a versão", async () => {
    const api = prepararHooksRadar();
    const { result, rerender } = renderHook(
      ({ aberta, captura }) =>
        useAprovacaoLegado(
          { ...api.controle.candidato, captura_id: captura },
          aberta,
        ),
      {
        wrapper: api.wrapper,
        initialProps: { aberta: false, captura: 11 },
      },
    );
    await waitFor(() =>
      expect(
        api.client.getQueryState(monitoramentoKeys.currentUser)?.status,
      ).toBe("success"),
    );
    expect(api.chamadas("/prova")).toHaveLength(0);
    rerender({ aberta: true, captura: 11 });
    await waitFor(() => expect(result.current.prova.data?.captura_id).toBe(11));
    api.controle.prova = { ...api.controle.prova, captura_id: 12 };
    rerender({ aberta: true, captura: 12 });
    await waitFor(() => expect(result.current.prova.data?.captura_id).toBe(12));
    expect(api.chamadas("/prova")).toHaveLength(2);
  });

  it.each(["triagem", "aprovação"])(
    "%s envia CSRF/referência exatos e atualiza fila e histórico",
    async (tipo) => {
      const api = prepararHooksRadar();
      api.client.setQueryData(["notificacoes", 1], { nao_lidas: 0 });
      api.client.setQueryData(["convenios-lista"], { total: 0 });
      const { result } = renderHook(
        () => ({
          lista: useCandidatosLegados(true, 1, ""),
          historico: useHistoricoLegado(7, true, 1),
          triagem: useTriagemLegado(7),
          aprovacao: useAprovacaoLegado(api.controle.candidato, true),
        }),
        { wrapper: api.wrapper },
      );
      await waitFor(() =>
        expect(result.current.lista.data?.itens[0].situacao).toBe("novo"),
      );
      await waitFor(() =>
        expect(result.current.aprovacao.prova.isSuccess).toBe(true),
      );
      const dadosTriagem = decisao();
      const dadosAprovacao = criarAprovacao();
      const dados = tipo === "triagem" ? dadosTriagem : dadosAprovacao;
      await act(async () => {
        if (tipo === "triagem")
          await result.current.triagem.mutation.mutateAsync(dadosTriagem);
        else
          await result.current.aprovacao.mutation.mutateAsync(dadosAprovacao);
      });
      const rota = tipo === "triagem" ? "/decisoes" : "/aprovacoes";
      const escrita = api.chamadas(rota);
      expect(escrita).toHaveLength(1);
      expect(escrita[0][1]?.method).toBe("POST");
      expect(escrita[0][1]?.headers).toMatchObject({
        "X-CSRF-Token": "csrf-sintetico",
      });
      expect(JSON.parse(String(escrita[0][1]?.body))).toMatchObject({
        captura_id: 11,
        versao: 0,
      });
      expect(JSON.parse(String(escrita[0][1]?.body))).toEqual(dados);
      await waitFor(() =>
        expect(result.current.lista.data?.itens[0].situacao).toBe(
          tipo === "triagem" ? "em_analise" : "aprovado",
        ),
      );
      await waitFor(() => expect(result.current.historico.data?.total).toBe(1));
      if (tipo === "aprovação") {
        expect(JSON.parse(String(escrita[0][1]?.body))).toEqual(dados);
        expect(
          api.client.getQueryState(["notificacoes", 1])?.isInvalidated,
        ).toBe(true);
        expect(
          api.client.getQueryState(["convenios-lista"])?.isInvalidated,
        ).toBe(true);
      }
    },
  );

  it.each([401, 403, 409, 503])(
    "triagem HTTP %i não repete escrita nem altera fila",
    async (status) => {
      const api = prepararHooksRadar();
      api.controle.interceptar = (url) =>
        url.pathname.endsWith("/decisoes")
          ? api.json({ detail: "Decisão não registrada" }, status)
          : undefined;
      const { result } = renderHook(() => useTriagemLegado(7), {
        wrapper: api.wrapper,
      });
      await waitFor(() => expect(result.current.podeDecidir).toBe(true));
      if (status === 401) api.controle.usuario = null;
      await act(async () => {
        await expect(
          result.current.mutation.mutateAsync(decisao()),
        ).rejects.toMatchObject({ status });
      });
      await waitFor(() =>
        expect(result.current.mutation.error).toBeInstanceOf(ApiError),
      );
      expect(api.chamadas("/decisoes")).toHaveLength(1);
      expect(api.controle.candidato.situacao).toBe("novo");
      if (status === 401)
        await waitFor(() => expect(result.current.podeDecidir).toBe(false));
    },
  );

  it.each([401, 403, 409, 503])(
    "aprovação HTTP %i mantém dados e não tenta novo POST",
    async (status) => {
      const api = prepararHooksRadar();
      api.controle.interceptar = (url) =>
        url.pathname.endsWith("/aprovacoes")
          ? api.json({ detail: "Aprovação não registrada" }, status)
          : undefined;
      const { result } = renderHook(
        () => useAprovacaoLegado(api.controle.candidato, true),
        { wrapper: api.wrapper },
      );
      await waitFor(() => expect(result.current.prova.isSuccess).toBe(true));
      if (status === 401) api.controle.usuario = null;
      await act(async () => {
        await expect(
          result.current.mutation.mutateAsync(criarAprovacao()),
        ).rejects.toMatchObject({ status });
      });
      await waitFor(() =>
        expect(result.current.mutation.error).toBeInstanceOf(ApiError),
      );
      expect(api.chamadas("/aprovacoes")).toHaveLength(1);
      expect(api.controle.candidato.situacao).toBe("novo");
      if (status === 401)
        await waitFor(() => expect(result.current.podeAprovar).toBe(false));
    },
  );

  it("recusa justificativas inválidas antes de enviar a decisão", async () => {
    const api = prepararHooksRadar();
    const { result } = renderHook(() => useTriagemLegado(7), {
      wrapper: api.wrapper,
    });
    await waitFor(() => expect(result.current.podeDecidir).toBe(true));
    await act(async () => {
      await expect(
        result.current.mutation.mutateAsync({
          ...decisao(),
          justificativa: "x",
        }),
      ).rejects.toMatchObject({ status: 422 });
    });
    expect(api.chamadas("/decisoes")).toHaveLength(0);
  });

  it.each(["erro HTTP", "outra identidade"])(
    "não permite aparentar prova válida em caso de %s",
    async (caso) => {
      const api = prepararHooksRadar();
      api.controle.interceptar = (url) =>
        url.pathname.endsWith("/prova")
          ? caso === "erro HTTP"
            ? api.json({ detail: "Prova indisponível" }, 503)
            : api.json({ ...api.controle.prova, candidato_id: 99 })
          : undefined;
      const { result } = renderHook(
        () => useAprovacaoLegado(api.controle.candidato, true),
        { wrapper: api.wrapper },
      );
      await waitFor(() => expect(result.current.prova.isError).toBe(true));
      expect(result.current.prova.error).toBeInstanceOf(ApiError);
      expect(result.current.prova.data).toBeUndefined();
      expect(api.chamadas("/prova")).toHaveLength(1);
      expect(api.chamadas("/aprovacoes")).toHaveLength(0);
    },
  );

  it("recusa referência de aprovação inválida antes de qualquer POST", async () => {
    const api = prepararHooksRadar();
    const { result } = renderHook(
      () => useAprovacaoLegado(api.controle.candidato, true),
      { wrapper: api.wrapper },
    );
    await waitFor(() => expect(result.current.prova.isSuccess).toBe(true));
    await act(async () => {
      await expect(
        result.current.mutation.mutateAsync({
          ...criarAprovacao(),
          hash_revisado: "inválido",
        }),
      ).rejects.toMatchObject({ status: 422 });
    });
    expect(api.chamadas("/aprovacoes")).toHaveLength(0);
  });
});
