import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { z } from "zod";
import { validarRecuperacaoLocal } from "./recuperacao-local";
import { validarConviteExpiradoLocal } from "./convite-expirado-local";

const caixaSchema = z.object({
  mensagens: z.array(z.object({ to: z.string(), html: z.string() })),
});

test("convite real: senha, primeiro login, renovação e recuperação segura", async ({
  page,
  playwright,
}) => {
  test.setTimeout(60000);
  // Given: preflight do launcher confere role/OID/caixa exclusivos do clone.
  expect(process.env.E2E_CONVITE_LOCAL).toBe("1");
  expect(process.env.E2E_BASE_URL).toBe("http://127.0.0.1:5181");
  const adminSenha = process.env.E2E_SENHA;
  const chaveCaixa = process.env.E2E_MAIL_SECRET;
  if (!adminSenha || !chaveCaixa) throw new Error("Ambiente local incompleto.");
  const api = "http://127.0.0.1:8001";
  const admin = await playwright.request.newContext({ baseURL: api });
  const sessaoAnterior = await playwright.request.newContext({ baseURL: api });
  const email = `convite-e2e-${randomUUID()}@example.com`;
  const senha = randomUUID() + randomUUID();
  let usuarioId: number | undefined;
  let csrfAdmin: string | undefined;
  await page.context().route("**/*", (route) => {
    if (new URL(route.request().url()).hostname !== "127.0.0.1")
      return route.abort();
    return route.continue();
  });
  try {
    await validarConviteExpiradoLocal(page);
    const loginAdmin = await admin.post("/auth/login", {
      data: { email: "admin.homologacao@example.com", password: adminSenha },
    });
    expect(loginAdmin.status()).toBe(200);
    const sessaoAdmin = z
      .object({ csrf_token: z.string() })
      .parse(await loginAdmin.json());
    csrfAdmin = sessaoAdmin.csrf_token;
    const headers = { "X-CSRF-Token": csrfAdmin };
    const convite = await admin.post("/usuarios", {
      headers,
      data: { name: "Convite sintético E2E", email, role: "colaborador" },
    });
    expect(convite.status()).toBe(201);
    usuarioId = z
      .object({ id: z.number().int().positive() })
      .parse(await convite.json()).id;
    const recebimento = await admin.get("http://127.0.0.1:8002/mensagens", {
      headers: { "X-Api-Key": chaveCaixa },
    });
    expect(recebimento.status()).toBe(200);
    const mensagem = caixaSchema
      .parse(await recebimento.json())
      .mensagens.find((m) => m.to === email);
    if (!mensagem) throw new Error("Convite não recebido na caixa local.");
    const href = mensagem.html.match(/href="([^"]*\/ativar#[^"]+)"/)?.[1];
    if (!href) throw new Error("Convite sem link de ativação.");
    const link = new URL(href.replaceAll("&amp;", "&"));
    expect(link.origin).toBe("http://127.0.0.1:5181");
    expect(link.search).toBe("");
    const token = new URLSearchParams(link.hash.slice(1)).get("token");
    if (!token) throw new Error("Convite sem token no fragmento.");
    // When: link real recebido; exceção não pode imprimir o token da URL.
    await page.goto(link.href).catch(() => {
      throw new Error("Navegação ao convite local falhou.");
    });
    await expect(
      page.getByRole("heading", { name: "Ative seu acesso" }),
    ).toBeVisible();
    await expect.poll(() => new URL(page.url()).hash).toBe("");
    await page.reload(); // O token deve sobreviver ao F5 na mesma aba.
    await page.getByLabel("Nova senha", { exact: true }).fill(senha);
    await page.getByLabel("Confirmar senha", { exact: true }).fill(senha);
    const ativacao = page.waitForResponse(
      (r) =>
        r.url() === `${api}/auth/ativar` && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    expect((await ativacao).status()).toBe(200);
    await expect(page).toHaveURL(/\/monitoramento-equipamentos$/, {
      timeout: 15000,
    });
    const identidade = await page.context().request.get(`${api}/auth/me`);
    expect(identidade.status()).toBe(200);
    expect(
      z
        .object({ email: z.string(), role: z.string() })
        .parse(await identidade.json()),
    ).toEqual({ email, role: "colaborador" });
    expect(
      await page.evaluate(() =>
        sessionStorage.getItem("sigeo_token_conta_activate"),
      ),
    ).toBeNull();
    const replay = await page
      .context()
      .request.post(`${api}/auth/ativar`, { data: { token, password: senha } });
    expect(replay.status()).toBe(400);
    // Then: sair e entrar com a senha definida, sem reutilizar sessão admin.
    await page.getByRole("button", { name: /^Menu de / }).click();
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(senha);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/monitoramento-equipamentos$/, {
      timeout: 15000,
    });
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: /Instrumentos e repasses/ }),
    ).toBeVisible();
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === "sigeo_access")?.httpOnly).toBe(true);
    const refreshAnterior = cookies.find(
      (c) => c.name === "sigeo_refresh",
    )?.value;
    await page.getByRole("button", { name: /^Menu de / }).click();
    const renovar = page.waitForResponse(
      (r) =>
        r.url() === `${api}/auth/refresh` && r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Renovar sessão", exact: true })
      .click();
    expect((await renovar).status()).toBe(200);
    const refreshAtual = (await page.context().cookies()).find(
      (c) => c.name === "sigeo_refresh",
    )?.value;
    expect(
      Boolean(
        refreshAnterior && refreshAtual && refreshAnterior !== refreshAtual,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await validarRecuperacaoLocal({
      page,
      caixa: admin,
      sessaoAnterior,
      email,
      senhaAnterior: senha,
      chaveCaixa,
    });
  } finally {
    // Preservar auditoria; a única conta criada pelo ensaio fica inativa.
    if (usuarioId && csrfAdmin) {
      const inativacao = await admin.post(`/usuarios/${usuarioId}/inativar`, {
        headers: { "X-CSRF-Token": csrfAdmin },
      });
      expect(inativacao.status()).toBe(200);
    }
    if (csrfAdmin)
      await admin.post("/auth/logout", {
        headers: { "X-CSRF-Token": csrfAdmin },
      });
    await admin.dispose();
    await sessaoAnterior.dispose();
  }
});
