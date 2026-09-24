import { expect, test } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL!;
const SENHA = process.env.E2E_SENHA!;
const TEMPO_SESSAO_MS = 20_000;

const DIMENSOES = [320, 375, 400, 768, 1024, 1440] as const;
const ROTAS_CRITICAS = [
  "/monitoramento-equipamentos",
  "/monitoramento-equipamentos/instrumentos",
  "/dashboard",
  "/mapa",
  "/relatorios",
] as const;

test.describe("Responsividade autenticada", () => {
  test("rotas críticas não têm overflow horizontal global", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.goto("/login");
    await page.getByLabel("Email").fill(EMAIL!);
    await page.getByLabel("Senha").fill(SENHA!);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL("/monitoramento-equipamentos", {
      timeout: TEMPO_SESSAO_MS,
    });

    for (const largura of DIMENSOES) {
      await page.setViewportSize({ width: largura, height: 900 });

      for (const rota of ROTAS_CRITICAS) {
        await page.goto(rota);
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(300);

        const dimensoes = await page.locator("html").evaluate((element) => ({
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }));

        expect(
          dimensoes.scrollWidth,
          `${rota} excede a viewport de ${largura}px (${dimensoes.scrollWidth}px de scrollWidth)`,
        ).toBeLessThanOrEqual(dimensoes.clientWidth);
      }
    }
  });
});
