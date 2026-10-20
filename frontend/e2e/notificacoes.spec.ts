import { expect, test } from "@playwright/test";

test("central individual: arquivo, restauração, leitura e responsividade", async ({
  page,
}) => {
  const aviso = {
    id: 1,
    tipo: "atualizacao_api",
    titulo: "Convênio 825374: atualização oficial",
    corpo:
      "SIT_CONVENIO: Em execução → Prestação de Contas Concluída; VL_GLOBAL_CONV: 100 → 120",
    entidade_id: 1,
    nivel_minimo: null,
    lida: false,
    arquivada: false,
    created_at: "2026-10-06T10:00:00Z",
    destino: null,
  };
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (!["fetch", "xhr"].includes(request.resourceType()))
      return route.continue();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/auth/me"))
      return route.fulfill({
        json: {
          id: 1,
          name: "Pessoa sintética",
          email: "qa@example.com",
          role: "admin",
          status: "active",
          created_at: "2026-10-06T10:00:00Z",
        },
      });
    if (url.pathname.endsWith("/auth/csrf"))
      return route.fulfill({ json: { csrf_token: "qa" } });
    if (url.pathname.endsWith("/fontes/capturas"))
      return route.fulfill({
        json: [
          {
            fonte: "siconv_legado",
            rotulo: "SICONV (convênios legados)",
            status: "parcial",
            ultima_tentativa_em: "2026-10-06T10:00:00Z",
            ultimo_sucesso_em: "2026-10-03T10:00:00Z",
            defasada: true,
            itens_verificados: 10,
            itens_alterados: 2,
            erro: "A fonte retornou dados incompletos. Os últimos dados confirmados foram preservados.",
          },
        ],
      });
    if (request.method() === "PATCH") {
      if (url.pathname.endsWith("/arquivo"))
        aviso.arquivada = request.postDataJSON().arquivada;
      else aviso.lida = true;
      return route.fulfill({
        json: url.pathname.endsWith("/lidas") ? { alteradas: 1 } : aviso,
      });
    }
    if (url.pathname.endsWith("/notificacoes")) {
      const arquivadas = url.searchParams.get("arquivadas") === "true";
      const itens =
        aviso.arquivada === arquivadas &&
        (!url.searchParams.has("apenas_nao_lidas") || !aviso.lida)
          ? [aviso]
          : [];
      return route.fulfill({
        json: {
          itens,
          total: itens.length,
          nao_lidas: !aviso.lida && !aviso.arquivada ? 1 : 0,
        },
      });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/monitoramento-equipamentos");
  await page.getByRole("button", { name: /Notificações/ }).click();
  await page.getByRole("button", { name: "Ver todas as notificações" }).click();
  const dialog = page.getByRole("dialog", { name: "Central de notificações" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(aviso.titulo)).toBeVisible();
  const card = dialog.getByRole("article", { name: aviso.titulo });
  await expect(card.getByText("Não lida", { exact: true })).toBeVisible();
  await expect(card.getByText(/VL_GLOBAL_CONV/)).toBeVisible();
  await expect(card.locator("details")).toHaveCount(0);
  await expect(
    dialog.getByText("Atualização das fontes oficiais", { exact: true }),
  ).toHaveCount(0);
  for (const width of [320, 375, 400, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await dialog.evaluate(async (el) => {
      await Promise.all(
        el.getAnimations().map((animacao) => animacao.finished),
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
    await dialog.evaluate(async (el) => {
      await Promise.all(
        el.getAnimations().map((animacao) => animacao.finished),
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
    const dimensoes = await dialog.evaluate((el) => ({
      largura: el.scrollWidth,
      visivel: el.clientWidth,
      esquerda: el.getBoundingClientRect().left,
      direita: window.innerWidth - el.getBoundingClientRect().right,
    }));
    expect(dimensoes.largura).toBeLessThanOrEqual(dimensoes.visivel);
    expect(dimensoes.esquerda).toBeGreaterThanOrEqual(16);
    expect(dimensoes.direita).toBeGreaterThanOrEqual(16);
    if (width === 400 || width === 768)
      await page.screenshot({
        path: `/private/tmp/sigeo-notificacoes-${width}.png`,
      });
    const arquivar = dialog.getByRole("button", {
      name: "Arquivar",
      exact: true,
    });
    await arquivar.scrollIntoViewIfNeeded();
    await expect(arquivar).toBeInViewport();
  }
  await dialog.getByRole("button", { name: "Arquivar", exact: true }).click();
  await expect(dialog.getByText(aviso.titulo)).not.toBeVisible();
  await dialog.getByRole("button", { name: /Tipo de notificação/ }).click();
  await expect(
    dialog.getByRole("option", { name: "Fonte indisponível", exact: true }),
  ).toBeInViewport();
  await dialog
    .getByRole("option", { name: "Todos os tipos", exact: true })
    .click();
  await dialog.getByRole("button", { name: /Tipo de notificação/ }).click();
  await expect(
    dialog.getByRole("option", { name: "Fonte indisponível", exact: true }),
  ).toBeInViewport();
  await dialog
    .getByRole("option", { name: "Todos os tipos", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Arquivadas", exact: true }).click();
  await dialog.getByRole("button", { name: "Restaurar" }).click();
  await dialog.getByRole("button", { name: "Recebidas", exact: true }).click();
  await expect(dialog.getByText(aviso.titulo)).toBeVisible();
  await dialog.getByRole("button", { name: "Marcar todas como lidas" }).click();
  await expect(
    dialog.getByRole("button", { name: "Marcar todas como lidas" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
