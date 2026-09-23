import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';
import { buscarContornoMunicipio } from './geojson';

afterEach(() => vi.unstubAllGlobals());

describe('geodados', () => {
  it('rejeita um payload que não é FeatureCollection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ invalido: true }), { status: 200 })));
    await expect(buscarContornoMunicipio('3550308')).rejects.toBeInstanceOf(ApiError);
  });

  it('normaliza indisponibilidade HTTP em ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await expect(buscarContornoMunicipio('3550308')).rejects.toBeInstanceOf(ApiError);
  });
});
