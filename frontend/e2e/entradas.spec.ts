import { expect, test } from "@playwright/test";
import { decisaoLegadoSchema } from "../src/lib/validations/decisao-legado";

test("central independente, sem aprovação automática, responsiva", async ({
  page,
}) => {
  let totalRadar = 1;
  const decisoes: {
    id: number;
    candidato_id: number;
    captura_id: number;
    usuario_id: number;
    usuario_nome: string;
    situacao_anterior: string;
    situacao: string;
    justificativa: string;
    criado_em: string;
  }[] = [];
  const candidato = {
    id: 1,
    numero: "900101",
    id_proposta: "1001",
    captura_id: 1,
    versao: 0,
    situacao: "novo",
    confirmacao_portal: "nao_consultado",
    data_publicacao: null,
    origem: "siconv_oficial",
    descoberto_em: "2026-10-06T10:00:00Z",
    verificado_em: "2026-10-06T10:00:00Z",
    componentes: [
      {
        id_programa: "53000",
        nome_programa:
          "REDE DE ATENCAO A PESSOA COM DOENCAS CRONICAS - AMBULATORIO PARA DIAGNOSTICO EM ONCOLOGIA",
        componente:
          "REDE DE ATENCAO A PESSOA COM DOENCAS CRONICAS - AMBULATORIO PARA DIAGNOSTICO EM ONCOLOGIA",
      },
    ],
    evidencias: [
      {
        id_item: "1",
        codigo: "acelerador_linear",
        nome: "Acelerador Linear",
        descricao:
          "Aquisição de acelerador linear — evidência sintética para demonstração de revisão.",
        relacao: "aquisicao",
      },
    ],
  };
  await page.route("**/*", async (route) => {
    if (!["fetch", "xhr"].includes(route.request().resourceType()))
      return route.continue();
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/csrf"))
      return route.fulfill({ json: { csrf_token: "csrf-sintetico" } });
    if (url.pathname.endsWith("/auth/me"))
      return route.fulfill({
        json: {
          id: 1,
          name: "Demonstração",
          email: "qa@example.com",
          role: "admin",
          status: "active",
          created_at: "2026-10-06T10:00:00Z",
        },
      });
    if (url.pathname.endsWith("/candidatos-legados"))
      return route.fulfill({
        json: {
          total: totalRadar,
          novos: candidato.situacao === "novo" ? totalRadar : 0,
          itens: totalRadar ? [candidato] : [],
        },
      });
    if (url.pathname.endsWith("/decisoes")) {
      expect(route.request().headers()["content-type"]).toBe(
        "application/json",
      );
      const dados = decisaoLegadoSchema.parse(route.request().postDataJSON());
      const decisao = {
        id: decisoes.length + 1,
        candidato_id: 1,
        captura_id: dados.captura_id,
        usuario_id: 1,
        usuario_nome: "Demonstração",
        situacao_anterior: candidato.situacao,
        situacao: dados.acao === "iniciar_analise" ? "em_analise" : "rejeitado",
        justificativa: dados.justificativa,
        criado_em: "2026-10-06T10:00:00Z",
      };
      decisoes.push(decisao);
      candidato.situacao = decisao.situacao;
      candidato.versao = decisao.id;
      return route.fulfill({ json: decisao });
    }
    if (url.pathname.endsWith("/historico"))
      return route.fulfill({
        json: { total: decisoes.length, itens: [...decisoes].reverse() },
      });
    if (url.pathname.endsWith("/notificacoes"))
      return route.fulfill({ json: { total: 0, itens: [], nao_lidas: 0 } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/monitoramento-equipamentos");
  const paginaOriginal = page.url();
  const icone = () =>
    page
      .getByRole("button", { name: /^Radar de instrumentos/ })
      .filter({ visible: true });
  await expect(icone()).toHaveAttribute(
    "aria-label",
    "Radar de instrumentos (1 na fila)",
  );
  await expect(icone().getByText("1", { exact: true })).toBeVisible();
  await icone().click();
  const dialog = page.getByRole("dialog", { name: "Radar de instrumentos" });
  await expect(dialog).toBeVisible();
  expect(page.url()).toBe(paginaOriginal);
  await expect(
    page.getByRole("heading", { name: "Radar de instrumentos" }),
  ).toBeVisible();
  await expect(page.getByText("Convênio 900101")).toBeVisible();
  await expect(
    dialog.getByText(candidato.componentes[0].componente),
  ).toBeVisible();
  await expect(
    dialog.getByText("Proposta 1001", { exact: true }),
  ).not.toBeVisible();
  await expect(dialog.getByText("1 evidência", { exact: true })).toHaveCount(0);
  await expect(
    dialog.getByRole("tab", { name: "Convênios", exact: true }),
  ).toHaveAttribute("data-state", "active");
  await expect(
    dialog.getByRole("tab", { name: "Propostas em tramitação", exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByText("Nenhuma coleta registrada.")).toBeVisible();
  const evidencia = dialog.getByText(
    "Aquisição de acelerador linear — evidência sintética para demonstração de revisão.",
  );
  await expect(evidencia).not.toBeVisible();
  await expect(dialog.getByText("Novo", { exact: true })).toBeVisible();
  await dialog.getByText("Mais detalhes", { exact: true }).click();
  await expect(
    dialog.getByText("Aguardando verificação", { exact: true }),
  ).toBeVisible();
  await expect(evidencia).toBeVisible();
  await dialog.getByText("Mais detalhes", { exact: true }).click();
  await expect(
    page.getByText("Convênios legados descobertos", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Aprovar|Incluir/ }),
  ).toHaveCount(0);
  for (const width of [320, 375, 400, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await dialog.evaluate(async (el) => {
      await Promise.all(
        el.getAnimations().map((animation) => animation.finished),
      );
    });
    await expect
      .poll(() => dialog.evaluate((el) => el.getBoundingClientRect().left))
      .toBeGreaterThanOrEqual(16);
    await expect
      .poll(() =>
        dialog.evaluate(
          (el) => window.innerWidth - el.getBoundingClientRect().right,
        ),
      )
      .toBeGreaterThanOrEqual(16);
    await expect(dialog).toBeInViewport();
    const larguraCard = await dialog
      .getByRole("heading", { name: "Convênio 900101", exact: true })
      .locator("../..")
      .evaluate((el) => el.getBoundingClientRect().width);
    for (const campo of [
      dialog.getByRole("textbox", { name: "Buscar candidato legado" }),
      dialog.getByRole("button", { name: /^Situação/ }),
    ]) {
      const larguraCampo = await campo.evaluate(
        (el) => el.getBoundingClientRect().width,
      );
      const larguraEsperada =
        width >= 640 ? (larguraCard - 8) / 2 : larguraCard;
      expect(Math.abs(larguraCampo - larguraEsperada)).toBeLessThanOrEqual(1);
    }
    await expect
      .poll(() => dialog.evaluate((el) => el.scrollWidth - el.clientWidth))
      .toBeLessThanOrEqual(0);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        ),
      )
      .toBeLessThanOrEqual(0);
    if (width === 400 || width === 768)
      await page.screenshot({
        path: `/private/tmp/sigeo-entradas-modal-${width}.png`,
      });
  }
  await expect(
    page.getByRole("link", { name: "Propostas em tramitação →", exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 400, height: 900 });
  await dialog
    .getByRole("button", { name: "Iniciar análise", exact: true })
    .click();
  await dialog
    .getByRole("textbox", { name: "Justificativa da análise" })
    .fill("Conferência sintética de evidências");
  await page.screenshot({ path: "/private/tmp/sigeo-triagem-form-400.png" });
  await dialog
    .getByRole("button", { name: "Confirmar decisão", exact: true })
    .click();
  await expect(dialog.getByText("Em análise", { exact: true })).toBeVisible();
  await dialog
    .getByRole("button", { name: "Histórico de decisões", exact: true })
    .click();
  await expect(
    dialog.getByText("Conferência sintética de evidências", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "/private/tmp/sigeo-triagem-historico-400.png",
  });
  await page.setViewportSize({ width: 768, height: 900 });
  await page.screenshot({
    path: "/private/tmp/sigeo-triagem-historico-768.png",
  });
  await expect
    .poll(() => dialog.evaluate((el) => el.scrollWidth - el.clientWidth))
    .toBeLessThanOrEqual(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(icone()).toBeFocused();
  await expect(icone()).toHaveAttribute("aria-label", "Radar de instrumentos");
  expect(page.url()).toBe(paginaOriginal);
  await icone().click();
  await expect(dialog).toBeVisible();
  expect(page.url()).toBe(paginaOriginal);
  totalRadar = 120;
  candidato.situacao = "novo";
  candidato.versao = 0;
  await page.reload();
  await expect(icone()).toHaveAttribute(
    "aria-label",
    "Radar de instrumentos (120 na fila)",
  );
  await expect(icone().getByText("99+", { exact: true })).toBeVisible();
  totalRadar = 0;
  await page.reload();
  await expect(icone()).toHaveAttribute("aria-label", "Radar de instrumentos");
  await expect(icone().getByText("99+", { exact: true })).toHaveCount(0);
});
