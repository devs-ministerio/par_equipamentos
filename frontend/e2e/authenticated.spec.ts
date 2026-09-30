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
    await expect(
      page
        .getByRole("link", { name: "Sair" })
        .or(page.getByRole("button", { name: "Sair" })),
    ).toBeVisible();
  });

  test("sair retorna imediatamente ao login", async ({ page }) => {
    await autenticar(page);
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
      page.getByRole("heading", {
        name: "Instrumentos com vigência a encerrar",
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
