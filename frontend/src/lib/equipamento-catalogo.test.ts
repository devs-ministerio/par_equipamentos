import { describe, expect, it } from 'vitest';
import { nomePrioritarioCanonico, resumirEquipamentoNaoPrioritario, SITUACOES_INSTRUMENTO_CONCLUIDO } from './equipamento-catalogo';

describe('catálogo de equipamento', () => {
  it('promove aliases de acelerador ao catálogo prioritário', () => {
    expect(nomePrioritarioCanonico('LINAC básico')).toBe('Acelerador Linear');
    expect(nomePrioritarioCanonico('Acelerador linear')).toBe('Acelerador Linear');
  });
  it('remove código e limita a descrição não prioritária', () => {
    expect(resumirEquipamentoNaoPrioritario('123 - Item complementar')).toBe('Item complementar');
    expect(resumirEquipamentoNaoPrioritario(`123 - ${'equipamento '.repeat(8)}`)).toMatch(/…$/);
  });
  it('reconhece as situações externas de conclusão', () => {
    expect(SITUACOES_INSTRUMENTO_CONCLUIDO.has('Prestação de Contas Concluída')).toBe(true);
    expect(SITUACOES_INSTRUMENTO_CONCLUIDO.has('Em operação')).toBe(true);
  });
});
