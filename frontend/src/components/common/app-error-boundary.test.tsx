import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './app-error-boundary';

function Falha(): never { throw new Error('falha de teste'); }

describe('AppErrorBoundary', () => {
  it('troca uma falha de renderização por recuperação segura', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<AppErrorBoundary><Falha /></AppErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível exibir esta página.');
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  });
});
