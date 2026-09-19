import { defineConfig, devices } from '@playwright/test';

/** E2E do fluxo de sessão (Etapa 10 do plan-mode frontend, 2026-09-17) --
 * exige o backend E o dev server do frontend já rodando (`npm run dev`,
 * backend em `uv run uvicorn app.main:app --port 8000`) e credencial de
 * teste via env (`E2E_EMAIL`/`E2E_SENHA`) -- nunca hardcoded no spec.
 * Rodar: `npx playwright install chromium` (1x, baixa o binário) + `npx
 * playwright test`. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
