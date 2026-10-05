import {
  expect,
  test as base,
  type BrowserContext,
  type Page,
} from "@playwright/test";

export { expect };

const EMAIL = process.env.E2E_EMAIL!;
const SENHA = process.env.E2E_SENHA!;
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

export const TEMPO_SESSAO_MS = 20_000;

/** Login real pela UI -- usar só onde o próprio fluxo de login é o assunto
 * do teste (authenticated.spec.ts: "login entra..." e "sair..." precisam
 * de uma sessão própria, nunca a compartilhada abaixo, porque logout
 * revoga o refresh token no servidor e invalidaria os outros testes que
 * reaproveitam a sessão). */
export async function autenticar(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/monitoramento-equipamentos", {
    timeout: TEMPO_SESSAO_MS,
  });
}

type EstadoAutenticado = Awaited<ReturnType<BrowserContext["storageState"]>>;

/** `test` com sessão autenticada compartilhada entre specs.
 *
 * A API limita login a 5/min por IP (`app/rate_limit.py`) e toda a suíte
 * roda serial contra o mesmo processo de backend (`playwright.config.ts`,
 * `workers: 1`) -- logar de novo em cada teste de cada arquivo batia no
 * limite assim que um segundo spec file também autenticava (achado ao
 * vivo, PR #26: 5 logins de `authenticated.spec.ts` + o login worker-scoped
 * de `responsive.spec.ts` = 6º, sempre 429).
 *
 * Login acontece 1x por worker (`estadoAutenticado`, escopo `worker`) e é
 * reaproveitado por todo teste que só PRECISA estar logado, sem testar o
 * fluxo de login em si -- `authenticated.spec.ts` e `responsive.spec.ts`
 * importam o mesmo `test` daqui, então o Playwright cacheia essa mesma
 * instância de fixture pro worker inteiro, nos dois arquivos. Nenhum token
 * é gravado em arquivo, só mantido em memória do processo do worker. */
export const test = base.extend<
  Record<string, never>,
  { estadoAutenticado: EstadoAutenticado }
>({
  estadoAutenticado: [
    async ({ browser }, aplicar) => {
      const contexto = await browser.newContext({ baseURL: BASE_URL });
      try {
        const pagina = await contexto.newPage();
        await autenticar(pagina);
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
