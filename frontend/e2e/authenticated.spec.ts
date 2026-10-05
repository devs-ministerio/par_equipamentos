import { expect, test } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL!;
const SENHA = process.env.E2E_SENHA!;
const TEMPO_SESSAO_MS = 20_000;

async function autenticar(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/monitoramento-equipamentos", {
    timeout: TEMPO_SESSAO_MS,
  });
}

test.describe("Fluxo autenticado", () => {
  test("login entra em rota protegida e oferece saída", async ({ page }) => {
    await autenticar(page);
    await page.getByRole("button", { name: /^Menu de / }).click();
    await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();

    const refreshAnterior = (await page.context().cookies()).find(
      (cookie) => cookie.name === "sigeo_refresh",
    )?.value;
    expect(refreshAnterior).toBeTruthy();
    const respostaRenovacao = page.waitForResponse(
      (resposta) =>
        resposta.request().method() === "POST" &&
        new URL(resposta.url()).pathname.endsWith("/auth/refresh"),
    );
    await page.getByRole("button", { name: "Renovar sessão" }).click();
    expect((await respostaRenovacao).ok()).toBe(true);
    await expect(page.getByText(/^Expira em /)).toBeVisible();
    const refreshNovo = (await page.context().cookies()).find(
      (cookie) => cookie.name === "sigeo_refresh",
    )?.value;
    expect(refreshNovo).toBeTruthy();
    expect(refreshNovo).not.toBe(refreshAnterior);

    await page.reload();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("sair retorna imediatamente ao login", async ({ page }) => {
    await autenticar(page);
    await page.getByRole("button", { name: /^Menu de / }).click();
    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("heading", { name: /entrar/i })).toBeVisible();
  });

  test("consulta os instrumentos monitorados após autenticar", async ({
    page,
  }) => {
    await autenticar(page);
    const respostaInstrumentos = page.waitForResponse(
      (resposta) =>
        resposta.request().method() === "GET" &&
        new URL(resposta.url()).pathname === "/monitoramento/instrumentos",
    );

    await page.goto("/monitoramento-equipamentos/instrumentos");
    expect((await respostaInstrumentos).ok()).toBe(true);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("baixa Excel e Word dos relatórios autenticados", async ({ page }) => {
    await autenticar(page);
    await page.goto("/monitoramento-equipamentos/relatorios");
    await expect(
      page.getByRole("heading", { name: "Relatórios" }),
    ).toBeVisible();

    for (const [rotulo, extensao] of [
      ["Baixar Excel", ".xlsx"],
      ["Baixar Word", ".docx"],
    ] as const) {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 60_000 }),
        page.getByRole("button", { name: new RegExp(rotulo) }).click(),
      ]);
      expect(download.suggestedFilename().startsWith("relatorio-")).toBe(true);
      expect(download.suggestedFilename().endsWith(extensao)).toBe(true);
      expect(await download.failure()).toBeNull();
    }
  });

  test("painel mostra recorte, dashboards e alternância do mapa", async ({
    page,
  }) => {
    await autenticar(page);
    await page.route("**/monitoramento/instrumentos", async (route) => {
      const resposta = await route.fetch();
      const instrumentos = await resposta.json();
      if (Array.isArray(instrumentos) && instrumentos.length) {
        instrumentos[0].latitude = -15.78;
        instrumentos[0].longitude = -47.93;
      }
      await route.fulfill({ response: resposta, json: instrumentos });
    });

    await page.goto("/monitoramento-equipamentos/painel");
    await expect(
      page.getByRole("heading", { name: "Painel de gestão" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Ano de inauguração" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Prazos e pendências" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: /Instrumentos com vigência a encerrar/,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /, \d+ instrumentos?/ })
      .first()
      .click();
    await expect(
      page.getByRole("button", { name: "Voltar ao mapa nacional" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Voltar ao mapa nacional" }).click();
    await expect(
      page.getByRole("group", { name: /Mapa de .* macrorregiões/ }),
    ).toBeVisible();
  });
});
