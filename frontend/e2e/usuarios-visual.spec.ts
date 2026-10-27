import { expect, test } from "@playwright/test";
import type { Usuario } from "../src/services/usuarios";

function usuariosVisuais(): Usuario[] {
  return [
    {
      id: 1,
      name: "Pessoa sintética",
      email: "qa@example.com",
      role: "colaborador",
      status: "active",
      created_at: "2026-10-20T10:00:00Z",
      activated_at: "2026-10-20T10:00:00Z",
      ultimo_login_em: "2026-10-27T02:30:00Z",
    },
    {
      id: 2,
      name: "Sem histórico",
      email: "qa2@example.com",
      role: "leitor",
      status: "inactive",
      created_at: "2026-10-20T10:00:00Z",
      activated_at: null,
      ultimo_login_em: null,
    },
  ];
}

for (const width of [400, 768]) {
  test(`último login e gerenciamento por ícone em ${width}px`, async ({
    page,
  }, testInfo) => {
    // Arrange: chamadas de dados simuladas, sem escrita ou envio a produção.
    await page.setViewportSize({ width, height: 1000 });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "fonts.googleapis.com")
        return route.fulfill({ contentType: "text/css", body: "" });
      if (!["fetch", "xhr"].includes(route.request().resourceType()))
        return route.continue();
      const path = url.pathname;
      if (route.request().method() !== "GET") {
        expect(path).not.toContain("/usuarios");
        return route.fulfill({ json: {} });
      }
      if (path.endsWith("/auth/me"))
        return route.fulfill({
          json: {
            id: 3,
            name: "Administrador sintético",
            email: "admin@example.com",
            role: "admin",
            status: "active",
            created_at: "2026-10-20T10:00:00Z",
          },
        });
      if (path.endsWith("/usuarios"))
        return route.fulfill({ json: { itens: usuariosVisuais(), total: 2 } });
      if (path.endsWith("/notificacoes"))
        return route.fulfill({ json: { itens: [], total: 0, nao_lidas: 0 } });
      if (path.endsWith("/candidatos-legados"))
        return route.fulfill({ json: { itens: [], total: 0, novos: 0 } });
      return route.fulfill({ json: [] });
    });
    // Act / Assert
    await page.goto("/admin/usuarios");
    await expect(
      page
        .getByText("26/10/2026, 23:30", { exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Sem registro", { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await expect(page.getByText("Ações", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Gerenciar", { exact: true })).toHaveCount(0);
    if (width >= 768)
      await expect(
        page.getByRole("columnheader", { name: "Último acesso" }),
      ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      )
      .toBeLessThanOrEqual(0);
    await page.screenshot({
      path: testInfo.outputPath(`usuarios-${width}.png`),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Gerenciar Pessoa sintética", exact: true })
      .filter({ visible: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Pessoa sintética", exact: true }),
    ).toBeVisible();
  });
}
