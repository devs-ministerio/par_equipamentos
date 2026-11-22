import { expect, test } from "@playwright/test";
import type {
  InstrumentoTimeline,
  EventoMarco,
} from "../src/services/monitoramento-instrumentos";
import { criarMarcosInteracao } from "../src/test-fixtures/monitoramento-interacoes";
import { criarDetalheConvenioResposta } from "../src/test-fixtures/convenios-detalhe";

function eventoVisual(marcoId: number): EventoMarco {
  return {
    id: marcoId,
    marco_id: marcoId,
    fase_geral_id: null,
    data_ocorrencia: "2026-10-19",
    data_prevista: null,
    status_regulatorio: marcoId === 3 ? "Deferido" : null,
    numero_documento: marcoId === 3 ? "2026SCRA0123456789" : null,
    data_validade: null,
    observacao: null,
    created_at: "2026-10-19T10:00:00Z",
    ativo: true,
  };
}

function timelineVisual(): InstrumentoTimeline {
  return {
    instrumento: {
      id: 1,
      nr_convenio: "QA001",
      cnpj_convenente: null,
      nome_convenente: "Unidade sintética de validação",
      municipio: "Brasília",
      uf: "DF",
      cnes: null,
      equipamento_descricao: "Acelerador Linear",
      equipamento_marca: null,
      equipamento_modelo: null,
      equipamento_numero_serie: null,
      equipamento_vida_util_anos: null,
      programa: null,
      tp_instrumento_programa: null,
      componente: null,
      ano_instrumento: null,
      tipo_contratacao: "Convênio",
      origem_dado: null,
      tipologia: null,
      investimento_aquisicao: null,
      situacao_programa: null,
      natureza_servico: null,
      tecnico_titular: null,
      tecnico_suplente: null,
      nivel_monitoramento: null,
      modalidade_onco: null,
      responsavel_execucao_nome: null,
      responsavel_execucao_contato: null,
      situacao_prestacao_contas: null,
      situacao_parceria_transferegov: null,
      situacao_ordem_pagamento_transferegov: null,
      pode_editar: true,
      fase_atual: "Concluído",
    },
    eventos: [eventoVisual(3), eventoVisual(4)],
    ao_vivo: { disponivel: false, valor_suspeito: false },
  };
}

for (const width of [400, 768]) {
  test(`licença com emissão e fase concluída em ${width}px`, async ({
    page,
  }, testInfo) => {
    // Arrange: somente HTTP é simulado; página, hooks, schemas e componentes reais.
    await page.setViewportSize({ width, height: 1000 });
    await page.route("**/*", async (route) => {
      // Fonte remota não é dependência da prova de layout; evita espera de rede.
      if (new URL(route.request().url()).hostname === "fonts.googleapis.com")
        return route.fulfill({ contentType: "text/css", body: "" });
      if (!["fetch", "xhr"].includes(route.request().resourceType()))
        return route.continue();
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() !== "GET") {
        expect(path).not.toContain("/monitoramento/");
        return route.fulfill({ json: {} });
      }
      if (path.endsWith("/auth/me"))
        return route.fulfill({
          json: {
            id: 1,
            name: "Gestor sintético",
            email: "qa@example.invalid",
            role: "gestor",
            status: "active",
            created_at: "2026-10-19T10:00:00Z",
          },
        });
      if (path.endsWith("/auth/csrf"))
        return route.fulfill({ json: { csrf_token: "csrf-sintetico" } });
      if (path.endsWith("/monitoramento/marcos"))
        return route.fulfill({ json: criarMarcosInteracao() });
      if (path.endsWith("/monitoramento/instrumentos/QA001"))
        return route.fulfill({ json: timelineVisual() });
      if (path.endsWith("/equipamentos"))
        return route.fulfill({
          json: {
            nr_convenio: "QA001",
            pode_editar: true,
            itens: [],
            outros_itens: 0,
            revisoes_pendentes: 0,
          },
        });
      if (path.endsWith("/convenios/QA001"))
        return route.fulfill({ json: criarDetalheConvenioResposta() });
      if (path.endsWith("/conclusao"))
        return route.fulfill({
          json: {
            nr_convenio: "QA001",
            pode_editar: false,
            conclusao: null,
            resultado: "sem_entregas",
            exige_justificativa: false,
            itens_exigidos: 0,
            itens_completos: 0,
            impedimentos: [],
          },
        });
      if (path.endsWith("/documentos"))
        return route.fulfill({
          json: {
            nr_convenio: "QA001",
            pode_editar: false,
            documentos: [
              {
                id: 1,
                tipo: "cnen_scra",
                numero: "2026SCRA0123456789",
                data_documento: "2026-10-19",
                status: "Deferido",
                data_validade: null,
                observacao: null,
              },
            ],
          },
        });
      if (path.endsWith("/repasse"))
        return route.fulfill({
          json: {
            repasse: null,
            repasse_previsto: false,
            fase_calculada: "aguardando_repasse",
          },
        });
      if (path.endsWith("/licenca-operacao"))
        return route.fulfill({
          json: {
            exige: false,
            cnes: null,
            sem_cnes: false,
            areas_exigidas: [],
            areas_sem_vinculo: [],
            vinculos: [],
            ultima_carga: null,
          },
        });
      if (path.endsWith("/acoes"))
        return route.fulfill({
          json: { data: [], meta: { total: 0, abertas: 0, atrasadas: 0 } },
        });
      if (path.endsWith("/notificacoes"))
        return route.fulfill({ json: { total: 0, itens: [], nao_lidas: 0 } });
      if (path.endsWith("/candidatos-legados"))
        return route.fulfill({ json: { total: 0, novos: 0, itens: [] } });
      return route.fulfill({ json: [] });
    });
    // Act / Assert
    await page.goto("/monitoramento-equipamentos/instrumentos/QA001");
    await expect(
      page.getByText("Nº 2026SCRA0123456789", { exact: true }),
    ).toBeVisible();
    const fase = page.locator('li[aria-current="step"]');
    await expect(fase).toContainText("Concluído");
    await expect(fase.locator(".rounded-full")).toHaveText("✓");
    await expect(fase.locator(".rounded-full")).toHaveClass(/bg-success/);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      )
      .toBeLessThanOrEqual(0);
    await page.screenshot({
      path: testInfo.outputPath(`monitoramento-${width}.png`),
      fullPage: true,
    });
  });
}
