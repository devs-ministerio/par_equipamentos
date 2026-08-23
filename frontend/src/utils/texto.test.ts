import { describe, expect, it } from 'vitest';
import { normalizarTexto } from './texto';

describe('normalizarTexto', () => {
  it('remove acento e ignora caixa -- "Sao Paulo" precisa achar "São Paulo"', () => {
    expect(normalizarTexto('São Paulo')).toBe(normalizarTexto('Sao Paulo'));
    expect(normalizarTexto('São Paulo')).toBe('sao paulo');
  });

  it('cedilha e outros acentos comuns em nome de municipio/regiao', () => {
    expect(normalizarTexto('Piripiri')).toBe('piripiri');
    expect(normalizarTexto('Conceição do Araguaia')).toBe('conceicao do araguaia');
    expect(normalizarTexto('AÇÚCAR')).toBe('acucar');
  });

  it('string ja normalizada fica igual (idempotente)', () => {
    expect(normalizarTexto('embu')).toBe('embu');
  });
});
