import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";

export async function validarConviteExpiradoLocal(page: Page) {
  // Given: launcher cria somente uma identidade sintética nova, já vencida.
  const token = process.env.E2E_CONVITE_EXPIRADO_TOKEN;
  if (!token) throw new Error("Fixture de convite expirado não fornecida.");
  const senha = randomUUID() + randomUUID();
  await page.goto(`/ativar#token=${encodeURIComponent(token)}`).catch(() => {
    throw new Error("Navegação ao convite expirado local falhou.");
  });
  await expect(
    page.getByRole("heading", { name: "Ative seu acesso" }),
  ).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe("");
  await page.reload();
  // When: formulário e API reais; sem substituir a resposta de ativação.
  await page.getByLabel("Nova senha", { exact: true }).fill(senha);
  await page.getByLabel("Confirmar senha", { exact: true }).fill(senha);
  const ativacao = page.waitForResponse(
    (r) =>
      r.url() === "http://127.0.0.1:8001/auth/ativar" &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  // Then: erro visível, sem redirecionamento nem cookie autenticado.
  expect((await ativacao).status()).toBe(400);
  await expect(page.getByRole("alert")).toHaveText(
    "Convite inválido ou expirado.",
  );
  await expect(
    page.getByRole("button", { name: "Continuar", exact: true }),
  ).toBeEnabled();
  expect(new URL(page.url()).pathname).toBe("/ativar");
  expect(
    (
      await page.context().request.get("http://127.0.0.1:8001/auth/me")
    ).status(),
  ).toBe(401);
  expect(
    (await page.context().cookies()).some(
      (c) => c.name === "sigeo_access" || c.name === "sigeo_refresh",
    ),
  ).toBe(false);
  // Retira só o token sintético desta aba depois de provar a rejeição.
  await page.evaluate(() =>
    sessionStorage.removeItem("sigeo_token_conta_activate"),
  );
  await page.goto("/login");
}
