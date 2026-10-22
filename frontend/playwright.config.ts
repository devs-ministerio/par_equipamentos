import { defineConfig, devices } from "@playwright/test";

/** E2E do fluxo de sessão (Etapa 10 do plan-mode frontend, 2026-09-17) --
 * exige o backend E o dev server do frontend já rodando (`npm run dev`,
 * backend em `uv run uvicorn app.main:app --port 8000`) e credencial de
 * teste via env (`E2E_EMAIL`/`E2E_SENHA`) -- nunca hardcoded no spec.
 * Rodar: `npx playwright install chromium` (1x, baixa o binário) + `npx
 * playwright test`. */
export default defineConfig({
  testDir: "./e2e",
  // O limite de login é por IP. A suíte compartilha uma credencial E2E e
  // precisa autenticar em ordem para não simular brute force no próprio CI.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    // Trace pode registrar interações com campo de senha. A evidência de
    // falha fica limitada a screenshot depois do login, sem persistir a
    // credencial em artefato.
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    ...(process.env.E2E_CONVITE_LOCAL === "1"
      ? [
          {
            name: "convite-local-chromium",
            testMatch: /convite-local\.spec\.ts/,
            use: { ...devices["Desktop Chrome"], screenshot: "off" as const },
          },
        ]
      : []),
    ...(process.env.E2E_RADAR_LOCAL === "1"
      ? [
          {
            name: "radar-local-chromium",
            testMatch: /radar-aprovacao-local\.spec\.ts/,
            use: { ...devices["Desktop Chrome"] },
          },
        ]
      : []),
    {
      name: "smoke-chromium",
      testMatch: /(?:smoke|notificacoes|entradas)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    ...(process.env.E2E_EMAIL && process.env.E2E_SENHA
      ? [
          {
            name: "autenticado-chromium",
            testMatch:
              /(?:authenticated|responsive|homologacao-local)\.spec\.ts/,
            use: { ...devices["Desktop Chrome"] },
          },
        ]
      : []),
  ],
});
