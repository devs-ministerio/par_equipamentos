import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-error";
import { criarDetalheConvenioResposta } from "@/test-fixtures/convenios-detalhe";
import {
  limparConsultasCobertura,
  prepararConsultasCobertura,
} from "@/test-fixtures/consultas-cobertura";
import { fetchConvenioDetalhe, fetchConvenios } from "./convenios";

afterEach(limparConsultasCobertura);

describe("contrato real de consulta dos instrumentos", () => {
  it("serializa todos os filtros e a paginação sem descartar acentos", async () => {
    // Arrange
    const h = prepararConsultasCobertura();
    h.fetch.mockResolvedValueOnce(
      h.json({ total: 1, itens: [criarDetalheConvenioResposta()] }),
    );
    // Act
    const resultado = await fetchConvenios({
      busca: "aquisição & instalação",
      uf: "BA",
      equipamento: "MAMOGRAFO",
      situacao: "Em execução",
      ano: 2026,
      programa: "Programa sintético",
      pagina: 2,
      tamanhoPagina: 10,
    });
    // Assert
    const url = new URL(String(h.fetch.mock.calls[0][0]));
    expect(Object.fromEntries(url.searchParams)).toEqual({
      busca: "aquisição & instalação",
      uf: "BA",
      equipamento: "MAMOGRAFO",
      situacao: "Em execução",
      ano: "2026",
      programa: "Programa sintético",
      pagina: "2",
      tamanho_pagina: "10",
    });
    expect(resultado.total).toBe(1);
    expect(resultado.itens[0]).toMatchObject({
      numero: "QA001",
      siconv: null,
      transferegov: null,
      financeiro: { global: 1000, desembolsado: 0 },
    });
  });

  it("consulta lista vazia com paginação padrão sem filtros fantasmas", async () => {
    // Arrange
    const h = prepararConsultasCobertura();
    h.fetch.mockResolvedValueOnce(h.json({ total: 0, itens: [] }));
    // Act
    expect(await fetchConvenios({})).toEqual({ total: 0, itens: [] });
    // Assert
    const url = new URL(String(h.fetch.mock.calls[0][0]));
    expect(Object.fromEntries(url.searchParams)).toEqual({
      pagina: "1",
      tamanho_pagina: "20",
    });
  });

  it("preserva identificador especial codificado no caminho", async () => {
    // Arrange
    const h = prepararConsultasCobertura();
    h.fetch.mockResolvedValueOnce(
      h.json(criarDetalheConvenioResposta({ numero: "QA /?&" })),
    );
    // Act
    const resultado = await fetchConvenioDetalhe("QA /?&");
    // Assert
    expect(resultado.numero).toBe("QA /?&");
    expect(new URL(String(h.fetch.mock.calls[0][0])).pathname).toBe(
      "/convenios/QA%20%2F%3F%26",
    );
  });

  it("recusa detalhe de outro instrumento com erro público seguro", async () => {
    // Arrange
    const h = prepararConsultasCobertura();
    h.fetch.mockResolvedValueOnce(
      h.json(criarDetalheConvenioResposta({ numero: "QA002" })),
    );
    // Act / Assert
    await expect(fetchConvenioDetalhe("QA001")).rejects.toMatchObject({
      name: "ApiError",
      publicMessage:
        "Não foi possível completar a operação. Tente novamente em instantes.",
    });
  });

  it("preserva ausência de dados sem convertê-la em zero financeiro", async () => {
    // Arrange
    const h = prepararConsultasCobertura();
    h.fetch.mockResolvedValueOnce(
      h.json(
        criarDetalheConvenioResposta({
          objeto: null,
          situacao: null,
          situacao_portal: null,
          convenente_tipo: null,
          municipio: null,
          uf: null,
          codigo_ibge: null,
          regiao: null,
          orgao: null,
          unidade_gestora: null,
          funcao: null,
          subfuncao: null,
          tipo_instrumento: null,
          numero_processo: null,
          valor_global: null,
          valor_pago_fornecedor: null,
          siconv_raw: null,
          transferegov_raw: null,
        }),
      ),
    );
    // Act
    const resultado = await fetchConvenioDetalhe("QA001");
    // Assert
    expect(resultado).toMatchObject({
      objeto: "",
      situacao: "",
      situacaoPortal: "",
      municipio: "",
      uf: "",
      orgao: "",
      numeroProcesso: "",
      convenente: { tipo: "" },
      financeiro: { global: null },
      valorPagoFornecedor: null,
      siconv: null,
      transferegov: null,
    });
  });

  it("prioriza código municipal sobre código de origem sem mudar o conteúdo", async () => {
    // Arrange
    const h = prepararConsultasCobertura();
    h.fetch.mockResolvedValueOnce(
      h.json(
        criarDetalheConvenioResposta({
          codigo_ibge: "ORIGEM",
          codigo_ibge_municipio: "MUNICIPIO",
        }),
      ),
    );
    // Act / Assert
    expect((await fetchConvenioDetalhe("QA001")).codigoIbge).toBe("MUNICIPIO");
  });

  it("carga manual não expõe JSON parcial como dado SICONV/TransfereGov oficial", async () => {
    // Arrange
    const h = prepararConsultasCobertura();
    h.fetch.mockResolvedValueOnce(
      h.json(
        criarDetalheConvenioResposta({
          tipo_contratacao: "TED",
          dados_oficiais_disponiveis: false,
          siconv_raw: {
            itens_plano_aplicacao: [{ DESCRICAO_ITEM: "Evidência interna" }],
          },
          transferegov_raw: { evidencia: "interna" },
        }),
      ),
    );
    // Act / Assert
    expect(await fetchConvenioDetalhe("QA001")).toMatchObject({
      dadosOficiaisDisponiveis: false,
      siconv: null,
      transferegov: null,
    });
  });

  it.each(["lista", "detalhe"])(
    "recusa schema inválido na %s",
    async (rota) => {
      // Arrange
      const h = prepararConsultasCobertura();
      h.fetch.mockResolvedValueOnce(
        h.json(
          rota === "lista"
            ? { total: 1, itens: [{ numero: 123 }] }
            : { numero: 123 },
        ),
      );
      // Act / Assert
      await expect(
        rota === "lista" ? fetchConvenios({}) : fetchConvenioDetalhe("QA001"),
      ).rejects.toBeInstanceOf(ApiError);
    },
  );

  it.each([403, 404, 503])(
    "preserva status %s sem sucesso fictício",
    async (status) => {
      // Arrange
      const h = prepararConsultasCobertura();
      h.fetch.mockResolvedValueOnce(
        h.json({ detail: "Mensagem controlada" }, status),
      );
      // Act / Assert
      await expect(fetchConvenioDetalhe("QA001")).rejects.toMatchObject({
        status,
        publicMessage:
          status < 500
            ? "Mensagem controlada"
            : "Não foi possível completar a operação. Tente novamente em instantes.",
      });
    },
  );
});
