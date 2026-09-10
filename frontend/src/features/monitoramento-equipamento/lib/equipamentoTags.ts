/** Mesmos 5 padroes/sinonimos "oficiais" usados em
 * backend/scripts/levantamento_convenios_oncologia.py::PADROES_EQUIPAMENTO
 * (os 5 do pedido original do usuario, 2026-09-03), MAIS 9 padroes
 * adicionais pedidos 2026-09-08 depois de mapear os itens NAO
 * reconhecidos dos 444 convenio -- Ultrassom/Endoscopia/Tomografo/
 * Ressonancia/Radioterapia(generico)/Raios X/Hemodialise/Angiografia/
 * Cobalto apareciam em volume real (2.250 itens nao mapeados no total,
 * a maioria mobiliario/informatica hospitalar generico, mas esses 9 sao
 * equipamento de imagem/tratamento especifico) sem tag nenhuma.
 * Reaproveitado aqui pra computar o KPI "Parque Tecnológico" e o filtro
 * por equipamento na lista principal, sem duplicar a varredura nacional
 * (so re-classifica os itens SICONV/TransfereGov que o convenio ja tem
 * carregado). Se os padroes do backend mudarem, atualizar os dois juntos. */
import { normalizarTexto } from '@/utils/texto';
import type { ConvenioUnificado } from '../types';

export const EQUIPAMENTOS_ALVO = [
  'Acelerador Linear', 'Mamógrafo', 'PET/CT', 'Gama-câmara/SPECT', 'Braquiterapia',
  'Ultrassom', 'Endoscopia', 'Tomógrafo', 'Ressonância', 'Radioterapia', 'Raios X', 'Hemodiálise', 'Angiografia', 'Cobalto',
] as const;
export type EquipamentoAlvo = (typeof EQUIPAMENTOS_ALVO)[number];

const PADROES: [EquipamentoAlvo, RegExp][] = [
  ['Acelerador Linear', /ACELERADOR\s*LINEAR/],
  ['Mamógrafo', /MAMOGRAFO/],
  ['PET/CT', /\bPET[\s/-]*CT\b/],
  ['Gama-câmara/SPECT', /GAMA\s*CAMARA|CAMARA\s*CINTILOGRAFICA|\bSPECT\b/],
  ['Braquiterapia', /BRAQUITERAPIA/],
  ['Ultrassom', /ULTRASSOM/],
  ['Endoscopia', /ENDOSCOP/],
  ['Tomógrafo', /TOMOGRAF/],
  ['Ressonância', /RESSONANC/],
  ['Radioterapia', /RADIOTERAPIA/],
  ['Raios X', /RAIOS\s*X/],
  ['Hemodiálise', /HEMODIALISE/],
  ['Angiografia', /ANGIOGRAF/],
  ['Cobalto', /COBALTO/],
];

/** Descricoes de item (SICONV `DESCRICAO_ITEM` + TransfereGov `nm_item`)
 * que o convenio tem, ja carregadas no objeto mesclado -- sem chamada de
 * rede nova. */
function descricoesDeItem(c: ConvenioUnificado): string[] {
  const descs: string[] = [];
  for (const it of c.siconv?.itens_plano_aplicacao ?? []) {
    if (it.DESCRICAO_ITEM) descs.push(it.DESCRICAO_ITEM);
  }
  for (const p of c.transferegov?.propostas_expandidas ?? []) {
    for (const m of p.metas) {
      for (const et of m.etapas_proposta) {
        for (const it of et.itens) {
          const nome = (it as Record<string, unknown>).nm_item;
          if (typeof nome === 'string') descs.push(nome);
        }
      }
    }
  }
  return descs;
}

export function equipamentosDoConvenio(c: ConvenioUnificado): EquipamentoAlvo[] {
  const descsNorm = descricoesDeItem(c).map(normalizarTexto).join(' | ').toUpperCase();
  const achados: EquipamentoAlvo[] = [];
  for (const [equip, padrao] of PADROES) {
    if (padrao.test(descsNorm)) achados.push(equip);
  }
  return achados;
}
