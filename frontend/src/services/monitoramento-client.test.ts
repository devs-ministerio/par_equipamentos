import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { requisitar } from '@/lib/http-client';
import { apiAuthed, apiGet, apiGetAuthed } from './monitoramento-client';

vi.mock('@/lib/http-client', () => ({ requisitar: vi.fn() }));

describe('adaptador HTTP de monitoramento', () => {
  const schema = z.object({ id: z.number() });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requisitar).mockResolvedValue({ id: 1 });
  });

  it('encaminha leituras públicas e autenticadas sem corpo', async () => {
    await expect(apiGet('/monitoramento/marcos', schema)).resolves.toEqual({ id: 1 });
    await expect(apiGetAuthed('/monitoramento/instrumentos', schema)).resolves.toEqual({ id: 1 });

    expect(requisitar).toHaveBeenNthCalledWith(1, '/monitoramento/marcos', schema, undefined);
    expect(requisitar).toHaveBeenNthCalledWith(2, '/monitoramento/instrumentos', schema, undefined);
  });

  it('serializa mutações JSON e preserva POST, PATCH e DELETE', async () => {
    await apiAuthed('/monitoramento/instrumentos', schema, 'POST', { nome: 'Hospital' });
    await apiAuthed('/monitoramento/eventos/1', schema, 'PATCH', { observacao: 'Ajuste' });
    await apiAuthed('/monitoramento/eventos/1', schema, 'DELETE');

    expect(requisitar).toHaveBeenNthCalledWith(1, '/monitoramento/instrumentos', schema, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'Hospital' }),
    });
    expect(requisitar).toHaveBeenNthCalledWith(2, '/monitoramento/eventos/1', schema, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ observacao: 'Ajuste' }),
    });
    expect(requisitar).toHaveBeenNthCalledWith(3, '/monitoramento/eventos/1', schema, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: undefined,
    });
  });
});
