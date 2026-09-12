import { describe, expect, it } from 'vitest';
import { corrigirTextoSiconv } from './monitoramento-format';

describe('corrigirTextoSiconv', () => {
  it('corrige o vocabulario burocratico fechado corrompido no dump SICONV', () => {
    expect(corrigirTextoSiconv('ATEN??O ESPECIALIZADA EM SA?DE')).toBe('ATENÇÃO ESPECIALIZADA EM SAÚDE');
    expect(corrigirTextoSiconv('A??O 2015.8535')).toBe('AÇÃO 2015.8535');
    expect(corrigirTextoSiconv('ESTRUTURA??O DE UNIDADES')).toBe('ESTRUTURAÇÃO DE UNIDADES');
    expect(corrigirTextoSiconv('CONV?NIO / EMENDA')).toBe('CONVÊNIO / EMENDA');
    expect(corrigirTextoSiconv('OR?AMENTO PROGRAMA')).toBe('ORÇAMENTO PROGRAMA');
    expect(corrigirTextoSiconv('AQUISI??O DE EQUIPAMENTO')).toBe('AQUISIÇÃO DE EQUIPAMENTO');
    expect(corrigirTextoSiconv('ENTIDADES FILANTR?PICAS')).toBe('ENTIDADES FILANTRÓPICAS');
    expect(corrigirTextoSiconv('ATEN??O ESPECIALIZADA ? SA?DE')).toBe('ATENÇÃO ESPECIALIZADA À SAÚDE');
  });

  it('nao mexe em "?" solto em texto livre (nao faz parte do vocabulario fechado)', () => {
    expect(corrigirTextoSiconv('10 leitos?')).toBe('10 leitos?');
    expect(corrigirTextoSiconv('WC?s adaptados')).toBe('WC?s adaptados');
  });

  it('preserva null/undefined/string vazia sem lançar', () => {
    expect(corrigirTextoSiconv(null)).toBeNull();
    expect(corrigirTextoSiconv(undefined)).toBeUndefined();
    expect(corrigirTextoSiconv('')).toBe('');
  });

  it('nao corrompe texto que ja esta correto', () => {
    expect(corrigirTextoSiconv('ATENÇÃO ESPECIALIZADA EM SAÚDE')).toBe('ATENÇÃO ESPECIALIZADA EM SAÚDE');
  });
});
