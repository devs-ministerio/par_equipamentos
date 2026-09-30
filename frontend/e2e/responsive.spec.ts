import {
  expect,
  test as base,
  type BrowserContext,
  type Page,
} from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL!;
const SENHA = process.env.E2E_SENHA!;
const TEMPO_SESSAO_MS = 20_000;
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

type EstadoAutenticado = Awaited<ReturnType<BrowserContext["storageState"]>>;

// A API limita login a 5/min por IP. O fluxo de autenticação é testado no
// spec próprio; aqui uma sessão em memória atende os dois testes, cada um
// em contexto isolado. Nenhum token ou credencial é gravado em arquivo.
const test = base.extend<
  { page: Page },
  { estadoAutenticado: EstadoAutenticado }
>({
  estadoAutenticado: [
    async ({ browser }, aplicar) => {
      const contexto = await browser.newContext({ baseURL: BASE_URL });
      try {
        const pagina = await contexto.newPage();
        await pagina.goto("/login");
        await pagina.getByLabel("Email").fill(EMAIL);
        await pagina.getByLabel("Senha").fill(SENHA);
        await pagina.getByRole("button", { name: "Entrar" }).click();
        await expect(pagina).toHaveURL("/monitoramento-equipamentos", {
          timeout: TEMPO_SESSAO_MS,
        });
        await aplicar(await contexto.storageState());
      } finally {
        await contexto.close();
      }
    },
    { scope: "worker" },
  ],
  page: async ({ browser, estadoAutenticado }, aplicar) => {
    const contexto = await browser.newContext({
      baseURL: BASE_URL,
      storageState: estadoAutenticado,
    });
    try {
      await aplicar(await contexto.newPage());
    } finally {
      await contexto.close();
    }
  },
});

const DIMENSOES = [320, 375, 400, 768, 1024, 1440] as const;
const ROTAS_CRITICAS = [
  "/monitoramento-equipamentos",
  "/monitoramento-equipamentos/instrumentos",
  "/monitoramento-equipamentos/painel",
  "/dashboard",
  "/mapa",
  "/relatorios",
] as const;

test.describe("Responsividade autenticada", () => {
  test("rotas críticas não têm overflow horizontal global", async ({
    page,
  }) => {
    test.setTimeout(120_000);

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

  test("mesa de trabalho e detalhe do instrumento cabem no celular", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    for (const largura of [320, 400, 768]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/monitoramento-equipamentos/instrumentos");

      const primeiroInstrumento = page
        .locator('[aria-label="Instrumentos monitorados"] article a')
        .first();
      await expect(primeiroInstrumento).toBeVisible({
        timeout: TEMPO_SESSAO_MS,
      });
      const href = await primeiroInstrumento.getAttribute("href");
      expect(href).toBeTruthy();

      const larguraMesa = await page.locator("html").evaluate((element) => ({
        visivel: element.clientWidth,
        conteudo: element.scrollWidth,
      }));
      expect(larguraMesa.conteudo).toBeLessThanOrEqual(larguraMesa.visivel);

      await page.goto(href!);
      await expect(
        page.locator("summary", { hasText: "Fase e cronograma" }),
      ).toBeVisible({
        timeout: TEMPO_SESSAO_MS,
      });
      const larguraDetalhe = await page.locator("html").evaluate((element) => ({
        visivel: element.clientWidth,
        conteudo: element.scrollWidth,
      }));
      expect(larguraDetalhe.conteudo).toBeLessThanOrEqual(
        larguraDetalhe.visivel,
      );
    }
  });
});
