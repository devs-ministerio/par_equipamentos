import { test as testeAnonimo } from "@playwright/test";
import { autenticar, expect, test } from "./fixtures";

// "login entra..." e "sair..." testam o fluxo de autenticação em si, então
// usam uma página anônima + login próprio (`autenticar`) -- nunca a sessão
// compartilhada de `./fixtures` (logout revogaria o refresh token no
// servidor e derrubaria qualquer outro teste que ainda fosse reaproveitá-la).
testeAnonimo.describe("Fluxo autenticado", () => {
  testeAnonimo(
    "login entra em rota protegida e oferece saída",
    async ({ page }) => {
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
    },
  );

  testeAnonimo("sair retorna imediatamente ao login", async ({ page }) => {
    await autenticar(page);
    await page.getByRole("button", { name: /^Menu de / }).click();
    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("heading", { name: /entrar/i })).toBeVisible();
  });
});

// Os testes abaixo só precisam estar logados, não testam o login em si --
// reaproveitam a sessão compartilhada de `./fixtures` (1 login por worker).
test.describe("Fluxo autenticado (sessão compartilhada)", () => {
  test("consulta os instrumentos monitorados após autenticar", async ({
    page,
  }) => {
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
