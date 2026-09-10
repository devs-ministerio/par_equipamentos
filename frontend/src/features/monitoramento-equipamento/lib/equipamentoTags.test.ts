import { describe, expect, it } from 'vitest';
import { equipamentosDoConvenio } from './equipamentoTags';
import type { ConvenioUnificado } from '../types';

/** Convenio minimo so com o que a funcao le -- ver equipamentoTags.ts. */
function convenioComItens(descricoes: string[]): ConvenioUnificado {
  return {
    siconv: {
      convenio: {},
      empenhos: [],
      desembolsos: [],
      licitacoes: [],
      termos_aditivos: [],
      itens_plano_aplicacao: descricoes.map((d) => ({ DESCRICAO_ITEM: d })),
    },
    transferegov: null,
  } as unknown as ConvenioUnificado;
}

describe('equipamentosDoConvenio', () => {
  it('acha Acelerador Linear pelo item real do convenio 948686 (010911-Acelerador Linear...)', () => {
    const c = convenioComItens(['010911-Acelerador Linear só de Fótons (monoenergético 6 MV)']);
    expect(equipamentosDoConvenio(c)).toEqual(['Acelerador Linear']);
  });

  it('acha Gama-câmara/SPECT mesmo sem a sigla SPECT literal (Câmara Cintilográfica)', () => {
    const c = convenioComItens(['000595-Câmara Cintilográfica (Gama Câmara)']);
    expect(equipamentosDoConvenio(c)).toEqual(['Gama-câmara/SPECT']);
  });

  it('acha PET/CT em variantes de grafia (PET CT, PET-CT)', () => {
    expect(equipamentosDoConvenio(convenioComItens(['000301-PET CT']))).toEqual(['PET/CT']);
    expect(equipamentosDoConvenio(convenioComItens(['PET-CT (novo modelo)']))).toEqual(['PET/CT']);
  });

  it('nao acha nada quando o item nao bate com nenhum dos 14 equipamentos-alvo', () => {
    const c = convenioComItens(['002274-Computador (Desktop-Básico)']);
    expect(equipamentosDoConvenio(c)).toEqual([]);
  });

  it('acha os 9 equipamentos adicionados 2026-09-08 pelos itens reais nao mapeados dos 444 convenio', () => {
    expect(equipamentosDoConvenio(convenioComItens(['011422-Ultrassom Diagnóstico Sem Aplicação Transesofágica']))).toEqual(['Ultrassom']);
    expect(equipamentosDoConvenio(convenioComItens(['011268-Sistema de Vídeo Endoscopia Flexível']))).toEqual(['Endoscopia']);
    expect(equipamentosDoConvenio(convenioComItens(['Tomógrafo Computadorizado 16 canais']))).toEqual(['Tomógrafo']);
    expect(equipamentosDoConvenio(convenioComItens(['Aparelho de Ressonância Magnética 1.5T']))).toEqual(['Ressonância']);
    expect(equipamentosDoConvenio(convenioComItens(['000361-Aparelho de Raios X - Móvel']))).toEqual(['Raios X']);
    expect(equipamentosDoConvenio(convenioComItens(['000483-Aparelho para Hemodiálise']))).toEqual(['Hemodiálise']);
    expect(equipamentosDoConvenio(convenioComItens(['Unidade de Cobalto Terapia']))).toEqual(['Cobalto']);
  });

  it('convenio sem siconv nem transferegov nao quebra, devolve lista vazia', () => {
    const c = { siconv: null, transferegov: null } as unknown as ConvenioUnificado;
    expect(equipamentosDoConvenio(c)).toEqual([]);
  });
});
