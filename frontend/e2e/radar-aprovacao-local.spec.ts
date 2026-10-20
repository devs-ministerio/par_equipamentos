import { expect, test, type Browser, type Page } from "@playwright/test";
import { z } from "zod";

const conta = z.object({ email: z.email(), senha: z.string().min(8) });
const fixtureSchema = z.object({
  usuarios: z.object({
    admin: conta,
    gestor: conta,
    colaborador: conta,
    leitor: conta,
  }),
  candidato_id: z.number().int().positive(),
});

async function entrar(browser: Browser, dados: z.infer<typeof conta>) {
  const context = await browser.newContext({
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  });
  // Apenas rede externa (fontes/assets) é bloqueada; API real é preservada.
  await context.route("**/*", (route) => {
    if (new URL(route.request().url()).hostname !== "127.0.0.1")
      return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(dados.email);
  await page.getByLabel("Senha").fill(dados.senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/monitoramento-equipamentos$/, {
    timeout: 15000,
  });
  return { context, page };
}

async function radar(page: Page) {
  await page
    .getByRole("button", { name: /^Radar de instrumentos/ })
    .filter({ visible: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Radar de instrumentos" });
  await expect(
    dialog.getByRole("heading", { name: "Convênio 999001" }),
  ).toBeVisible();
  return dialog;
}

test("aprovação real: papéis, duas revisões, conflito, histórico, aviso e destino", async ({
  browser,
}) => {
  test.setTimeout(90000);
  expect(new URL(process.env.E2E_BASE_URL!).origin).toBe(
    "http://127.0.0.1:5194",
  );
  const dados = fixtureSchema.parse(JSON.parse(process.env.E2E_RADAR_FIXTURE!));
  // Given: quatro sessões e dados vindos exclusivamente do PostgreSQL local.
  for (const perfil of ["colaborador", "leitor"] as const) {
    const { context, page } = await entrar(browser, dados.usuarios[perfil]);
    try {
      const dialog = await radar(page);
      await expect(
        dialog.getByRole("button", { name: "Conferir para aprovar" }),
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
  }
  const admin = await entrar(browser, dados.usuarios.admin);
  const gestor = await entrar(browser, dados.usuarios.gestor);
  try {
    const filaAdmin = await radar(admin.page);
    const filaGestor = await radar(gestor.page);
    for (const fila of [filaAdmin, filaGestor]) {
      await fila.getByRole("button", { name: "Conferir para aprovar" }).click();
      await fila
        .getByLabel("Justificativa da aprovação")
        .fill("Aquisição conferida no ensaio local");
      await fila
        .getByRole("checkbox", {
          name: "Conferi os dados oficiais deste convênio.",
        })
        .check();
      await expect(
        fila.getByText("Instituição sintética", { exact: true }),
      ).toBeVisible();
    }
    const rejeicaoCsrf = await gestor.context.request.post(
      `http://127.0.0.1:8003/candidatos-legados/${dados.candidato_id}/aprovacoes`,
      { data: {} },
    );
    expect(rejeicaoCsrf.status()).toBe(403);
    // When: mesma prova aberta em duas sessões; a primeira decisão é humana.
    for (const width of [320, 375, 400, 768, 1024, 1440]) {
      await admin.page.setViewportSize({ width, height: 900 });
      await expect(filaAdmin).toBeInViewport();
      await expect
        .poll(() => filaAdmin.evaluate((el) => el.scrollWidth - el.clientWidth))
        .toBeLessThanOrEqual(0);
      await expect
        .poll(() =>
          admin.page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          ),
        )
        .toBeLessThanOrEqual(0);
      if (width === 400 || width === 768)
        await admin.page.screenshot({
          path: `/private/tmp/sigeo-radar-prova-real-${width}.png`,
        });
    }
    await filaAdmin.getByRole("button", { name: "Aprovar e incluir" }).click();
    await expect(
      filaAdmin.getByText("Aprovado", { exact: true }),
    ).toBeVisible();
    const conflito = gestor.page.waitForResponse(
      (resposta) =>
        resposta.url().endsWith("/aprovacoes") &&
        resposta.request().method() === "POST",
    );
    await filaGestor.getByRole("button", { name: "Aprovar e incluir" }).click();
    expect((await conflito).status()).toBe(409);
    await expect(
      filaGestor.getByRole("button", { name: "Aprovar e incluir" }),
    ).toBeDisabled();
    // Then: histórico identifica autor; aviso leva à carteira, não pós-repasse.
    await admin.page.setViewportSize({ width: 400, height: 900 });
    await filaAdmin
      .getByRole("button", { name: "Histórico de decisões" })
      .click();
    await expect(
      filaAdmin.getByText("Aquisição conferida no ensaio local", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(filaAdmin.getByText(/admin ·/)).toBeVisible();
    await expect(admin.page.locator("[data-sonner-toast]")).toHaveCount(0);
    await admin.page.screenshot({
      path: "/private/tmp/sigeo-radar-aprovacao-real-400.png",
    });
    await admin.page.keyboard.press("Escape");
    const sino = admin.page
      .getByRole("button", { name: "Notificações (1 não lida)", exact: true })
      .filter({ visible: true });
    await expect(sino).toBeVisible();
    await sino.click();
    await admin.page
      .getByRole("button", { name: /Entrada aprovada: convênio 999001/ })
      .click();
    await expect(admin.page).toHaveURL(
      /\/monitoramento-equipamentos\?busca=999001$/,
    );
    await expect(admin.page.getByText("999001", { exact: true })).toBeVisible();
    await expect(
      admin.page.getByText("Não foi possível carregar os dados", {
        exact: true,
      }),
    ).toHaveCount(0);
  } finally {
    await admin.context.close();
    await gestor.context.close();
  }
});
