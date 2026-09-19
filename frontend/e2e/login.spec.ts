import { test, expect } from '@playwright/test';

/** Login + rota protegida (Etapa 10 do plan-mode frontend) -- exige
 * `E2E_EMAIL`/`E2E_SENHA` no ambiente (nunca commitar credencial real no
 * spec). Pula os testes automaticamente se as env vars não estiverem
 * setadas, em vez de falhar o CI por falta de segredo. */
const EMAIL = process.env.E2E_EMAIL;
const SENHA = process.env.E2E_SENHA;

test.describe('Login e rota protegida', () => {
  test.skip(!EMAIL || !SENHA, 'E2E_EMAIL/E2E_SENHA não configurados neste ambiente.');

  test('rota protegida sem sessão redireciona pra /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login com credencial válida entra e navega pra rota protegida', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(EMAIL!);
    await page.getByLabel('Senha').fill(SENHA!);
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL('/monitoramento-equipamentos');
    await expect(page.getByRole('link', { name: 'Sair' }).or(page.getByRole('button', { name: 'Sair' }))).toBeVisible();
  });
});
