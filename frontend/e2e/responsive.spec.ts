import { TEMPO_SESSAO_MS, expect, test } from "./fixtures";

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
