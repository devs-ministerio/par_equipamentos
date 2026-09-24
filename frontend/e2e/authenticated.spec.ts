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
});
