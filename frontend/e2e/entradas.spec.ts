import { expect, test } from "@playwright/test";

test("central independente, sem aprovação automática, responsiva", async ({
  page,
}) => {
  const candidato = {
    id: 1,
    numero: "900101",
    id_proposta: "1001",
    confirmacao_portal: "nao_consultado",
    data_publicacao: null,
    origem: "snapshot_local",
    descoberto_em: "2026-10-06T10:00:00Z",
    verificado_em: "2026-10-06T10:00:00Z",
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
      return route.fulfill({ json: { total: 1, itens: [candidato] } });
    if (url.pathname.endsWith("/notificacoes"))
      return route.fulfill({ json: { total: 0, itens: [], nao_lidas: 0 } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/monitoramento-equipamentos/entradas");
  await expect(
    page.getByRole("heading", { name: "Central de entradas" }),
  ).toBeVisible();
  await expect(page.getByText("Convênio 900101")).toBeVisible();
  await expect(
    page.getByText("Convênios legados descobertos", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Aprovar|Incluir/ }),
  ).toHaveCount(0);
  for (const width of [320, 375, 400, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page
        .getByRole("link", { name: "Central de entradas", exact: true })
        .filter({ visible: true }),
    ).toBeInViewport();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        ),
      )
      .toBeLessThanOrEqual(0);
    if (width === 400 || width === 768)
      await page.screenshot({
        path: `/private/tmp/sigeo-entradas-${width}.png`,
      });
  }
  const financiamento = page.getByRole("link", {
    name: "Linhas de financiamento",
    exact: true,
  });
  await expect(financiamento).toHaveAttribute(
    "href",
    "/monitoramento-equipamentos?aba=componentes",
  );
});
