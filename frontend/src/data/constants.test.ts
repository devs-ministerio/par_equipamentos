import { describe, expect, it } from 'vitest';
import { EQUIPAMENTOS, formatarQuantidadeEquipamento, getEquipamento } from './constants';

describe('getEquipamento', () => {
  it('acha a familia certa', () => {
    expect(getEquipamento('TOMOGRAFO').produtividade).toBe(100_000);
    expect(getEquipamento('RESSONANCIA').rotulo).toBe('Ressonância Magnética');
  });

  it('familia desconhecida cai no fallback (TOMOGRAFO, EQUIPAMENTOS[0]) -- nunca deixa a tela sem produtividade', () => {
    expect(getEquipamento('ALGO_INEXISTENTE')).toBe(EQUIPAMENTOS[0]);
  });

  it('TOMOGRAFO e RESSONANCIA tem produtividade DIFERENTE -- bug real corrigido 2026-08-21 (front usava 100_000 fixo pras duas)', () => {
    expect(getEquipamento('TOMOGRAFO').produtividade).not.toBe(getEquipamento('RESSONANCIA').produtividade);
  });

  it('PET_CT esta disponivel com a produtividade da Portaria de Consolidacao n. 1/2017 (art. 102-106)', () => {
    const petCt = getEquipamento('PET_CT');
    expect(petCt.disponivel).toBe(true);
    expect(petCt.produtividade).toBe(1_500_000);
  });
});

describe('formatarQuantidadeEquipamento', () => {
  it('concordancia singular/plural', () => {
    expect(formatarQuantidadeEquipamento(1)).toBe('1 equipamento');
    expect(formatarQuantidadeEquipamento(0)).toBe('0 equipamentos');
    expect(formatarQuantidadeEquipamento(3)).toBe('3 equipamentos');
  });
});
