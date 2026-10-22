import {
  expect,
  test as base,
  type BrowserContext,
  type Page,
} from "@playwright/test";

type EstadoAutenticado = Awaited<ReturnType<BrowserContext["storageState"]>>;
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

// Consultas compartilham só a sessão em memória, nunca contexto de navegador.
// Login/saída usam o test base em authenticated.spec.ts para validar a jornada.
export const test = base.extend<
  { page: Page },
  { estadoAutenticado: EstadoAutenticado }
>({
  estadoAutenticado: [
    async ({ browser }, aplicar) => {
      const contexto = await browser.newContext({ baseURL: BASE_URL });
      try {
        const pagina = await contexto.newPage();
        await pagina.goto("/login");
        await pagina.getByLabel("Email").fill(process.env.E2E_EMAIL!);
        await pagina.getByLabel("Senha").fill(process.env.E2E_SENHA!);
        await pagina.getByRole("button", { name: "Entrar" }).click();
        await expect(pagina).toHaveURL("/monitoramento-equipamentos", {
          timeout: 20_000,
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
