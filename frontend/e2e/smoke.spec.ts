import { expect, test } from "@playwright/test";

test.describe("Smoke sem sessão", () => {
  test("rota protegida redireciona para login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
