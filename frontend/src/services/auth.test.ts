import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';
import { requisitar } from '@/lib/http-client';
import {
  ativarConta,
  fetchCurrentUser,
  login,
  logout,
  redefinirSenha,
  solicitarRecuperacao,
} from './auth';

vi.mock('@/lib/http-client', () => ({ requisitar: vi.fn() }));

const USUARIO = {
  id: 1,
  name: 'Pessoa Administradora',
  email: 'admin@sigeo.local',
  role: 'admin' as const,
  status: 'active' as const,
  created_at: '2026-09-24T10:00:00Z',
};

describe('service de autenticação', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requisitar).mockResolvedValue({ status: 'ok' });
  });

  it('envia o login sem persistir credenciais no cliente', async () => {
    await login('admin@sigeo.local', 'senha-segura');

    expect(requisitar).toHaveBeenCalledWith(
      '/auth/login',
      expect.anything(),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@sigeo.local', password: 'senha-segura' }),
      },
    );
  });

  it.each([
    ['logout', () => logout(), '/auth/logout', undefined],
    ['ativação', () => ativarConta('token-convite', 'nova-senha'), '/auth/ativar', { token: 'token-convite', password: 'nova-senha' }],
    ['recuperação', () => solicitarRecuperacao('pessoa@example.org'), '/auth/esqueci-senha', { email: 'pessoa@example.org' }],
    ['redefinição', () => redefinirSenha('token-recuperacao', 'nova-senha'), '/auth/redefinir-senha', { token: 'token-recuperacao', password: 'nova-senha' }],
  ])('encaminha a operação de %s para a rota correta', async (_nome, executar, rota, corpo) => {
    await executar();

    expect(requisitar).toHaveBeenCalledWith(
      rota,
      expect.anything(),
      corpo === undefined
        ? { method: 'POST' }
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(corpo),
          },
    );
  });

  it('devolve o usuário validado da sessão atual', async () => {
    vi.mocked(requisitar).mockResolvedValueOnce(USUARIO);

    await expect(fetchCurrentUser()).resolves.toEqual(USUARIO);
    expect(requisitar).toHaveBeenCalledWith('/auth/me', expect.anything(), undefined, { redirecionarEm401: false });
  });

  it('trata 401 de /auth/me como visitante anônimo', async () => {
    vi.mocked(requisitar).mockRejectedValueOnce(new ApiError('Não autenticado', 401));

    await expect(fetchCurrentUser()).resolves.toBeNull();
  });

  it('preserva falhas de infraestrutura da consulta de sessão', async () => {
    const erro = new ApiError('Servidor indisponível', 503);
    vi.mocked(requisitar).mockRejectedValueOnce(erro);

    await expect(fetchCurrentUser()).rejects.toBe(erro);
  });
});
