import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { z } from "zod";

const caixaSchema = z.object({
  mensagens: z.array(z.object({ to: z.string(), html: z.string() })),
});

/** Somente a conta sintética criada pelo convite; nenhuma credencial é gravada. */
export async function validarRecuperacaoLocal({
  page,
  caixa,
  sessaoAnterior,
  email,
  senhaAnterior,
  chaveCaixa,
}: {
  page: Page;
  caixa: APIRequestContext;
  sessaoAnterior: APIRequestContext;
  email: string;
  senhaAnterior: string;
  chaveCaixa: string;
}) {
  const api = "http://127.0.0.1:8001";
  const senhaNova = randomUUID() + randomUUID();
  // Given: sessão independente anterior à troca de senha.
  const loginAnterior = await sessaoAnterior.post(`${api}/auth/login`, {
    data: { email, password: senhaAnterior },
  });
  expect(loginAnterior.status()).toBe(200);
  const csrfAnterior = z
    .object({ csrf_token: z.string() })
    .parse(await loginAnterior.json()).csrf_token;
  await page.goto("/esqueci-senha");
  await expect(
    page.getByRole("heading", { name: "Recuperar acesso" }),
  ).toBeVisible();
  await page.getByLabel("Email").fill(email);
  const pedido = page.waitForResponse(
    (r) =>
      r.url() === `${api}/auth/esqueci-senha` &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Enviar link", exact: true }).click();
  expect((await pedido).status()).toBe(200);
  await expect(
    page.getByText(
      "Se o e-mail estiver cadastrado, você receberá as instruções.",
    ),
  ).toBeVisible();
  expect((await sessaoAnterior.get(`${api}/auth/me`)).status()).toBe(200);
  const recebimento = await caixa.get("http://127.0.0.1:8002/mensagens", {
    headers: { "X-Api-Key": chaveCaixa },
  });
  expect(recebimento.status()).toBe(200);
  const mensagem = caixaSchema
    .parse(await recebimento.json())
    .mensagens.filter(
      (m) => m.to === email && m.html.includes("/redefinir-senha#"),
    )
    .at(-1);
  const href = mensagem?.html.match(
    /href="([^"]*\/redefinir-senha#[^"]+)"/,
  )?.[1];
  if (!href) throw new Error("Redefinição não recebida na caixa local.");
  const link = new URL(href.replaceAll("&amp;", "&"));
  expect(link.origin).toBe("http://127.0.0.1:5181");
  expect(link.search).toBe("");
  const token = new URLSearchParams(link.hash.slice(1)).get("token");
  if (!token) throw new Error("Redefinição sem token no fragmento.");
  // When: UI real lê o fragmento, limpa a URL e preserva o token no F5.
  await page.goto(link.href).catch(() => {
    throw new Error("Navegação à redefinição local falhou.");
  });
  await expect(
    page.getByRole("heading", { name: "Redefina sua senha" }),
  ).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe("");
  await page.reload();
  await page.getByLabel("Nova senha", { exact: true }).fill(senhaNova);
  await page.getByLabel("Confirmar senha", { exact: true }).fill(senhaNova);
  const troca = page.waitForResponse(
    (r) =>
      r.url() === `${api}/auth/redefinir-senha` &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  expect((await troca).status()).toBe(200);
  await expect(page).toHaveURL(/\/monitoramento-equipamentos$/, {
    timeout: 15000,
  });
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("sigeo_token_conta_reset"),
    ),
  ).toBeNull();
  // Then: a sessão antiga (acesso e refresh) é revogada no servidor.
  expect((await sessaoAnterior.get(`${api}/auth/me`)).status()).toBe(401);
  const renovarAnterior = await sessaoAnterior.post(`${api}/auth/refresh`, {
    headers: { "X-CSRF-Token": csrfAnterior },
  });
  expect(renovarAnterior.status()).toBe(401);
  await page.getByRole("button", { name: /^Menu de / }).click();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(senhaAnterior);
  const loginAntigo = page.waitForResponse(
    (r) => r.url() === `${api}/auth/login` && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  expect((await loginAntigo).status()).toBe(401);
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("Senha", { exact: true }).fill(senhaNova);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/monitoramento-equipamentos$/, {
    timeout: 15000,
  });
  expect((await page.context().request.get(`${api}/auth/me`)).status()).toBe(
    200,
  );
  const replay = await page
    .context()
    .request.post(`${api}/auth/redefinir-senha`, {
      data: { token, password: senhaNova },
    });
  expect(replay.status()).toBe(400);
  await page.getByRole("button", { name: /^Menu de / }).click();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
}
