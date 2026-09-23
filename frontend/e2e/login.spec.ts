import { test, expect } from '@playwright/test';

/** A barreira de rota é sempre verificável. Só a autenticação com sucesso
 * depende de credencial descartável, recebida exclusivamente pelo ambiente. */
const EMAIL = process.env.E2E_EMAIL;
const SENHA = process.env.E2E_SENHA;
const TEMPO_SESSAO_MS = 20_000;

test.describe('Login e rota protegida', () => {
  test('rota protegida sem sessão redireciona pra /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login com credencial válida entra e navega pra rota protegida', async ({ page }) => {
    test.skip(!EMAIL || !SENHA, 'E2E_EMAIL/E2E_SENHA não configurados neste ambiente.');
    await page.goto('/login');
    await page.getByLabel('Email').fill(EMAIL!);
    await page.getByLabel('Senha').fill(SENHA!);
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL('/monitoramento-equipamentos', { timeout: TEMPO_SESSAO_MS });
    await expect(page.getByRole('link', { name: 'Sair' }).or(page.getByRole('button', { name: 'Sair' }))).toBeVisible();
  });
});
